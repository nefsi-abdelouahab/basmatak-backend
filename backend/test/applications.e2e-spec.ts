import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../src/core/status-transitions/status-histories.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const OBJECT_ID = /^[0-9a-f]{24}$/;

describe('applications & participations e2e (S7)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(email: string, endpoint: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(endpoint)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record.token })
      .expect(204);
  }

  async function markVerified(slug: string): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne({ slug }, { $set: { verificationStatus: 'verified' } })
        .exec();
    } finally {
      await connection.close();
    }
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await register(email, ORG_REGISTER);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(email, VOLUNTEER_REGISTER);
    await verifyLatestEmail();
    return token;
  }

  async function createOpportunity(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, any>> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(response.status).toBe(201);
    return response.body;
  }

  async function publishOpportunity(
    token: string,
    opportunityId: string,
  ): Promise<void> {
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function setOpportunityStatus(
    opportunityId: string,
    status: string,
  ): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OpportunitiesCollection, OpportunitySchema)
        .updateOne(
          { _id: new Types.ObjectId(opportunityId) },
          { $set: { status } },
        )
        .exec();
    } finally {
      await connection.close();
    }
  }

  async function readFilledCount(opportunityId: string): Promise<number> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const doc = await connection
        .model(OpportunitiesCollection, OpportunitySchema)
        .findById(opportunityId)
        .lean();
      return (doc?.positions[0] as any)?.filledCount ?? NaN;
    } finally {
      await connection.close();
    }
  }

  async function readApplicationStatus(
    applicationId: string,
  ): Promise<string | null> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const doc = await connection
        .collection('applications')
        .findOne({ _id: new Types.ObjectId(applicationId) });
      return doc ? (doc.status as string) : null;
    } finally {
      await connection.close();
    }
  }

  async function historyCount(
    entityType: string,
    entityId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      return await connection
        .model(StatusHistoryCollection, StatusHistorySchema)
        .countDocuments({
          entityType,
          entityId: new Types.ObjectId(entityId),
          from,
          to,
        })
        .exec();
    } finally {
      await connection.close();
    }
  }

  let orgToken: string;
  let volunteerToken: string;
  let opportunity: Record<string, any>;
  let positionId: string;

  beforeAll(async () => {
    orgToken = await registerVerifiedOrg('s7-org@example.com');
    volunteerToken = await registerVerifiedVolunteer(
      's7-volunteer@example.com',
    );
    opportunity = await createOpportunity(orgToken, {
      title: 'S7 Sandy Beach Cleanup',
      description: 'Coastal cleanup day',
      positions: [
        { title: 'Bag wrangler', requiredCount: 1, requiredSkills: [] },
      ],
    });
    positionId = opportunity.positions[0]._id as string;
    await publishOpportunity(orgToken, opportunity._id);
  });

  describe('apply', () => {
    let applicationId: string;

    it('creates a pending application', async () => {
      const response = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);
      expect(response.body.status).toBe('pending');
      expect(String(response.body.opportunityId)).toBe(String(opportunity._id));
      expect(String(response.body.positionId)).toBe(positionId);
      expect(String(response.body.volunteerId)).toMatch(OBJECT_ID);
      applicationId = response.body._id as string;
    });

    it('appears in /applications/me', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`${APPLICATIONS}/me`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]._id).toBe(applicationId);
    });

    it('rejects a duplicate live application with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(409);
      expect(response.body.code).toBe('DUPLICATE_APPLICATION');
    });

    it('rejects an unknown opportunity with 404', async () => {
      await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/000000000000000000000000/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(404);
    });

    it('is invisible to other volunteers (404 not 403)', async () => {
      const bystander = await registerVerifiedVolunteer(
        's7-bystander@example.com',
      );
      await request(info.app.getHttpServer())
        .get(`${APPLICATIONS}/${applicationId}`)
        .set('Authorization', `Bearer ${bystander}`)
        .expect(404);
    });

    it('is visible to the owning organization', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`${APPLICATIONS}/${applicationId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(response.body._id).toBe(applicationId);
      expect(response.body.status).toBe('pending');
    });
  });

  describe('reject', () => {
    let applicationId: string;
    let secondVolunteer: string;

    beforeAll(async () => {
      secondVolunteer = await registerVerifiedVolunteer(
        's7-reject@example.com',
      );
      const response = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${secondVolunteer}`)
        .expect(201);
      applicationId = response.body._id as string;
    });

    it('rejects a pending application with reason, claiming no seat', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${applicationId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'profile incomplete' })
        .expect(200);
      expect(response.body.status).toBe('rejected');
      expect(response.body.reason).toBe('profile incomplete');
      expect(await readApplicationStatus(applicationId)).toBe('rejected');
      expect(await readFilledCount(opportunity._id)).toBe(0);
      expect(
        await historyCount('application', applicationId, 'pending', 'rejected'),
      ).toBe(1);
    });

    it('lets the volunteer reapply after a rejection', async () => {
      await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${secondVolunteer}`)
        .expect(201);
    });

    it('rejects an already-handled application with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${applicationId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'again' })
        .expect(409);
      expect(response.body.code).toBe('INVALID_APPLICATION_STATUS');
    });
  });

  describe('accept (transaction)', () => {
    let crewOpp: Record<string, any>;
    let crewPositionId: string;
    let v1: string;
    let v2: string;
    let v3: string;
    let app1: string;

    beforeAll(async () => {
      crewOpp = await createOpportunity(orgToken, {
        title: 'S7 Crew Mobilization',
        description: 'Crew needed',
        positions: [
          { title: 'Team member', requiredCount: 2, requiredSkills: [] },
        ],
      });
      crewPositionId = crewOpp.positions[0]._id as string;
      await publishOpportunity(orgToken, crewOpp._id);
      v1 = await registerVerifiedVolunteer('s7-cv1@example.com');
      v2 = await registerVerifiedVolunteer('s7-cv2@example.com');
      v3 = await registerVerifiedVolunteer('s7-cv3@example.com');
    });

    it('accepts and atomically claims the seat, creates the participant and history', async () => {
      const applied = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${crewOpp._id}/positions/${crewPositionId}/applications`,
        )
        .set('Authorization', `Bearer ${v1}`)
        .expect(201);
      app1 = applied.body._id as string;

      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${app1}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(response.body.status).toBe('accepted');
      expect(await readApplicationStatus(app1)).toBe('accepted');
      expect(await readFilledCount(crewOpp._id)).toBe(1);
      expect(
        await historyCount('application', app1, 'pending', 'accepted'),
      ).toBe(1);

      const myTasks = await request(info.app.getHttpServer())
        .get(`${PARTICIPATIONS}/me`)
        .set('Authorization', `Bearer ${v1}`)
        .expect(200);
      expect(myTasks.body.items).toHaveLength(1);
    });

    it('accepts until the seat pool is exhausted (POSITION_FULL at the boundary)', async () => {
      const a2 = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${crewOpp._id}/positions/${crewPositionId}/applications`,
          )
          .set('Authorization', `Bearer ${v2}`)
          .expect(201)
      ).body._id as string;
      const a3 = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${crewOpp._id}/positions/${crewPositionId}/applications`,
          )
          .set('Authorization', `Bearer ${v3}`)
          .expect(201)
      ).body._id as string;

      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${a2}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(response.body.status).toBe('accepted');
      expect(await readFilledCount(crewOpp._id)).toBe(2);

      const blocked = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${a3}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(409);
      expect(blocked.body.code).toBe('POSITION_FULL');
      expect(await readFilledCount(crewOpp._id)).toBe(2);
      expect(await readApplicationStatus(a3)).toBe('pending');
    });

    it('rejects accepting a non-pending application with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${app1}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(409);
      expect(response.body.code).toBe('INVALID_APPLICATION_STATUS');
    });

    it('creates an active participant when accepting into an in_progress opportunity', async () => {
      const live = await createOpportunity(orgToken, {
        title: 'S7 Live Crew',
        description: 'Already running',
        positions: [{ title: 'Runner', requiredCount: 2, requiredSkills: [] }],
      });
      await publishOpportunity(orgToken, live._id);
      const applied = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${live._id}/positions/${live.positions[0]._id}/applications`,
        )
        .set('Authorization', `Bearer ${v1}`)
        .expect(201);
      await setOpportunityStatus(live._id, 'in_progress');
      await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${applied.body._id}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const active = await request(info.app.getHttpServer())
        .get(`${PARTICIPATIONS}/me?status=active`)
        .set('Authorization', `Bearer ${v1}`)
        .expect(200);
      expect(
        active.body.items.some((item: any) => item.status === 'active'),
      ).toBe(true);
    });
  });

  describe('withdraw', () => {
    let pendingOpp: Record<string, any>;
    let pendingApp: string;
    let acceptedOpp: Record<string, any>;
    let acceptedApp: string;
    let withdrawVolunteer: string;

    beforeAll(async () => {
      withdrawVolunteer = await registerVerifiedVolunteer(
        's7-withdraw@example.com',
      );

      pendingOpp = await createOpportunity(orgToken, {
        title: 'S7 Pending Opp',
        description: 'Not yet decided',
        positions: [
          { title: 'Observer', requiredCount: 1, requiredSkills: [] },
        ],
      });
      await publishOpportunity(orgToken, pendingOpp._id);
      pendingApp = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${pendingOpp._id}/positions/${pendingOpp.positions[0]._id}/applications`,
          )
          .set('Authorization', `Bearer ${withdrawVolunteer}`)
          .expect(201)
      ).body._id as string;

      acceptedOpp = await createOpportunity(orgToken, {
        title: 'S7 Accepted Opp',
        description: 'Seat will be freed',
        positions: [{ title: 'Crew', requiredCount: 1, requiredSkills: [] }],
      });
      await publishOpportunity(orgToken, acceptedOpp._id);
      acceptedApp = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${acceptedOpp._id}/positions/${acceptedOpp.positions[0]._id}/applications`,
          )
          .set('Authorization', `Bearer ${withdrawVolunteer}`)
          .expect(201)
      ).body._id as string;
      await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${acceptedApp}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
    });

    it('withdraws a pending application without touching seats', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${pendingApp}/withdraw`)
        .set('Authorization', `Bearer ${withdrawVolunteer}`)
        .expect(200);
      expect(response.body.status).toBe('withdrawn');
      expect(await readFilledCount(pendingOpp._id)).toBe(0);
      expect(
        await historyCount('application', pendingApp, 'pending', 'withdrawn'),
      ).toBe(1);
    });

    it('withdraws an accepted application: participant withdrawn and seat freed', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${acceptedApp}/withdraw`)
        .set('Authorization', `Bearer ${withdrawVolunteer}`)
        .expect(200);
      expect(response.body.status).toBe('withdrawn');
      expect(await readFilledCount(acceptedOpp._id)).toBe(0);
      expect(
        await historyCount('application', acceptedApp, 'accepted', 'withdrawn'),
      ).toBe(1);

      const myTasks = await request(info.app.getHttpServer())
        .get(`${PARTICIPATIONS}/me`)
        .set('Authorization', `Bearer ${withdrawVolunteer}`)
        .expect(200);
      expect(myTasks.body.items).toHaveLength(1);
      expect(myTasks.body.items[0].status).toBe('withdrawn');
    });

    it('rejects a second withdraw with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${acceptedApp}/withdraw`)
        .set('Authorization', `Bearer ${withdrawVolunteer}`)
        .expect(409);
      expect(response.body.code).toBe('INVALID_APPLICATION_STATUS');
    });
  });

  describe('participations organization side', () => {
    let crewOpp: Record<string, any>;
    let crewVolunteer: string;
    let participationId: string;

    beforeAll(async () => {
      crewVolunteer = await registerVerifiedVolunteer('s7-crew@example.com');
      crewOpp = await createOpportunity(orgToken, {
        title: 'S7 Crew Ops',
        description: 'Crew needed',
        positions: [{ title: 'Lead', requiredCount: 1, requiredSkills: [] }],
      });
      await publishOpportunity(orgToken, crewOpp._id);
      const application = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${crewOpp._id}/positions/${crewOpp.positions[0]._id}/applications`,
        )
        .set('Authorization', `Bearer ${crewVolunteer}`)
        .expect(201);
      await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${application.body._id}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const tasks = await request(info.app.getHttpServer())
        .get(`${PARTICIPATIONS}/me`)
        .set('Authorization', `Bearer ${crewVolunteer}`)
        .expect(200);
      participationId = tasks.body.items[0]._id as string;
    });

    it('lists active participants with volunteer identity', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`/api/v1/opportunities/${crewOpp._id}/participants`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]._id).toBe(participationId);
      expect(response.body.items[0].volunteer.username).toBe('s7-crew');
    });

    it('is blocked for volunteers by the role guard', async () => {
      await request(info.app.getHttpServer())
        .get(`/api/v1/opportunities/${crewOpp._id}/participants`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
    });

    it('removes a participant with reason but keeps the seat', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/remove`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'no-show' })
        .expect(200);
      expect(response.body.status).toBe('removed');
      expect(response.body.reason).toBe('no-show');
      expect(await readFilledCount(crewOpp._id)).toBe(1);
      expect(
        await historyCount(
          'task_participant',
          participationId,
          'accepted',
          'removed',
        ),
      ).toBe(1);
    });

    it('rejects removing an already-handled participant with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/remove`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'again' })
        .expect(409);
      expect(response.body.code).toBe('INVALID_PARTICIPATION_STATUS');
    });
  });

  describe('volunteer withdraw via participations route', () => {
    let crewOpp: Record<string, any>;
    let crewVolunteer: string;
    let participationId: string;

    beforeAll(async () => {
      crewVolunteer = await registerVerifiedVolunteer('s7-pw@example.com');
      crewOpp = await createOpportunity(orgToken, {
        title: 'S7 Crew Withdraw',
        description: 'Crew needed',
        positions: [{ title: 'Driver', requiredCount: 1, requiredSkills: [] }],
      });
      await publishOpportunity(orgToken, crewOpp._id);
      const application = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${crewOpp._id}/positions/${crewOpp.positions[0]._id}/applications`,
        )
        .set('Authorization', `Bearer ${crewVolunteer}`)
        .expect(201);
      await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${application.body._id}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const tasks = await request(info.app.getHttpServer())
        .get(`${PARTICIPATIONS}/me`)
        .set('Authorization', `Bearer ${crewVolunteer}`)
        .expect(200);
      participationId = tasks.body.items[0]._id as string;
    });

    it('frees the seat and marks the participant withdrawn', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/withdraw`)
        .set('Authorization', `Bearer ${crewVolunteer}`)
        .expect(200);
      expect(response.body.status).toBe('withdrawn');
      expect(await readFilledCount(crewOpp._id)).toBe(0);
      expect(
        await historyCount(
          'task_participant',
          participationId,
          'accepted',
          'withdrawn',
        ),
      ).toBe(1);
    });

    it('a stranger cannot withdraw someone elses participation (404)', async () => {
      const stranger = await registerVerifiedVolunteer(
        's7-stranger@example.com',
      );
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/withdraw`)
        .set('Authorization', `Bearer ${stranger}`)
        .expect(404);
      expect(response.body.code).toBe('PARTICIPATION_NOT_FOUND');
    });
  });

  describe('cross-organization guardrails', () => {
    let otherOrg: string;

    beforeAll(async () => {
      otherOrg = await registerVerifiedOrg('s7-other-org@example.com');
    });

    it('a non-owning org sees no applications for an opportunity (404)', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`/api/v1/opportunities/${opportunity._id}/applications`)
        .set('Authorization', `Bearer ${otherOrg}`)
        .expect(404);
      expect(response.body.code).toBe('OPPORTUNITY_NOT_FOUND');
    });

    it('applications from another org are invisible even with a valid id (404)', async () => {
      const outsider = await registerVerifiedVolunteer(
        's7-outsider@example.com',
      );
      const application = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${outsider}`)
        .expect(201);
      const response = await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${application.body._id}/accept`)
        .set('Authorization', `Bearer ${otherOrg}`)
        .expect(404);
      expect(response.body.code).toBe('APPLICATION_NOT_FOUND');
    });
  });

  describe('accept race on the last seat (no over-booking)', () => {
    let raceOpp: Record<string, any>;
    let racerA: string;
    let racerB: string;

    beforeAll(async () => {
      raceOpp = await createOpportunity(orgToken, {
        title: 'S7 Last Seat',
        description: 'Two racers for one seat',
        positions: [
          { title: 'Solo spot', requiredCount: 1, requiredSkills: [] },
        ],
      });
      await publishOpportunity(orgToken, raceOpp._id);
      racerA = await registerVerifiedVolunteer('s7-racer-a@example.com');
      racerB = await registerVerifiedVolunteer('s7-racer-b@example.com');
    });

    it('exactly one of two concurrent accepts wins the single seat', async () => {
      const a = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${raceOpp._id}/positions/${raceOpp.positions[0]._id}/applications`,
          )
          .set('Authorization', `Bearer ${racerA}`)
          .expect(201)
      ).body._id as string;
      const b = (
        await request(info.app.getHttpServer())
          .post(
            `${OPPORTUNITIES}/${raceOpp._id}/positions/${raceOpp.positions[0]._id}/applications`,
          )
          .set('Authorization', `Bearer ${racerB}`)
          .expect(201)
      ).body._id as string;

      const [resA, resB] = await Promise.all([
        request(info.app.getHttpServer())
          .post(`${APPLICATIONS}/${a}/accept`)
          .set('Authorization', `Bearer ${orgToken}`),
        request(info.app.getHttpServer())
          .post(`${APPLICATIONS}/${b}/accept`)
          .set('Authorization', `Bearer ${orgToken}`),
      ]);
      expect([resA.status, resB.status].sort()).toEqual([200, 409]);
      expect(await readFilledCount(raceOpp._id)).toBe(1);
      const win = resA.status === 200 ? a : b;
      const lose = resA.status === 200 ? b : a;
      expect(await readApplicationStatus(win)).toBe('accepted');
      expect(await readApplicationStatus(lose)).toBe('pending');
    });
  });
});

describe('email gate on apply (A10)', () => {
  let gated: TestAppHandle;
  let gatedMail: TestMailService;

  beforeAll(async () => {
    gatedMail = new TestMailService();
    gated = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000', EMAIL_VERIFICATION_REQUIRED: 'true' },
      providers: [{ token: MAIL_SERVICE, useValue: gatedMail }],
    });
  });

  afterAll(async () => {
    if (gated) {
      await gated.close();
    }
  });

  it('blocks an unverified volunteer from applying with 403 EMAIL_NOT_VERIFIED', async () => {
    const registration = await request(gated.app.getHttpServer())
      .post(VOLUNTEER_REGISTER)
      .send({ email: 's7-unverified@example.com', password: 'Password123!' })
      .expect(201);
    const token = registration.body.accessToken as string;

    const response = await request(gated.app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/000000000000000000000000/positions/${new Types.ObjectId()}/applications`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
