import * as bcrypt from 'bcrypt';
import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { UsersService } from '../src/users/users.service';
import { ReliabilityService } from '../src/trust/reliability.service';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../src/organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  ReviewModel,
  ReviewSchema,
  ReviewsCollection,
} from '../src/reviews/review.schema';
import {
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../src/core/status-transitions/status-histories.schema';
import {
  SubmissionModel,
  SubmissionSchema,
  SubmissionsCollection,
} from '../src/submissions/schemas/submission.schema';

const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const ORG_REGISTER = '/api/v1/auth/register/organization';
const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/auth/me';
const REPORTS = '/api/v1/reports';
const ADMIN_REPORTS = '/api/v1/admin/reports';
const ADMIN_REVIEWS = '/api/v1/admin/reviews';
const ADMIN_OPPORTUNITIES = '/api/v1/admin/opportunities';
const ADMIN_AUDIT_LOGS = '/api/v1/admin/audit-logs';
const ADMIN_SETTINGS = '/api/v1/admin/settings';
const ORG_ME = '/api/v1/organizations/me';
const ORG_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const ADMIN_EMAIL = 'root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';

const OPPORTUNITY_PAYLOAD = {
  title: 'Build a community well',
  description: 'Fresh water for the village',
  positions: [
    { title: 'Helper', description: 'Carry supplies', requiredCount: 2 },
  ],
};

async function seedOpenConnection(uri: string) {
  const connection = await createConnection(uri).asPromise();
  return connection;
}

describe('admin e2e (Part B: opportunities, reviews, reports, audit, settings)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    const users = info.app.get(UsersService);
    await users.create({
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    const login = await request(info.app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;
    const me = await request(info.app.getHttpServer())
      .get(ME)
      .set(auth(adminToken))
      .expect(200);
    adminId = me.body.id as string;
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerVolunteer(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(VOLUNTEER_REGISTER)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function registerOrg(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(ORG_REGISTER)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function ownOrganization(token: string): Promise<OrganizationModel> {
    const response = await request(info.app.getHttpServer())
      .get(ORG_ME)
      .set(auth(token))
      .expect(200);
    return response.body as OrganizationModel;
  }

  async function seedOpportunity(
    orgId: Types.ObjectId,
    status: string,
    suffix: string,
  ): Promise<string> {
    const connection = await seedOpenConnection(info.uri);
    try {
      const opportunityModel = connection.model<OpportunityModel>(
        OpportunitiesCollection,
        OpportunitySchema,
      );
      const row = await opportunityModel.create({
        organizationId: orgId,
        slug: `partb-${suffix}-${new Types.ObjectId().toString()}`,
        title: `PartB ${suffix}`,
        description: `PartB ${suffix} description`,
        status,
      });
      return row._id.toString();
    } finally {
      await connection.close();
    }
  }

  describe('9.2 reports triage', () => {
    let volunteerToken: string;
    let orgId = '';

    beforeAll(async () => {
      volunteerToken = await registerVolunteer('report.vol@example.com');
      const orgToken = await registerOrg('report.org@example.com');
      const organization = await ownOrganization(orgToken);
      orgId = organization._id.toString();
    });

    it('volunteer creates a report that the admin can resolve', async () => {
      const created = await request(info.app.getHttpServer())
        .post(REPORTS)
        .set(auth(volunteerToken))
        .send({
          targetType: 'organization',
          targetId: orgId,
          reason: 'Suspicious volunteer recruitment',
          description: 'They keep posting the same opportunity',
        })
        .expect(201);
      const reportId = created.body._id as string;
      expect(created.body.reporterId).toBeDefined();
      expect(created.body.status).toBe('open');

      const listed = await request(info.app.getHttpServer())
        .get(`${ADMIN_REPORTS}?status=open`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        listed.body.items.some((row: { _id: string }) => row._id === reportId),
      ).toBe(true);

      const resolved = await request(info.app.getHttpServer())
        .patch(`${ADMIN_REPORTS}/${reportId}`)
        .set(auth(adminToken))
        .send({
          status: 'resolved',
          resolution: 'Contacted the organization — no action needed',
        })
        .expect(200);
      expect(resolved.body.status).toBe('resolved');
      expect(resolved.body.resolution).toBe(
        'Contacted the organization — no action needed',
      );

      const illegal = await request(info.app.getHttpServer())
        .patch(`${ADMIN_REPORTS}/${reportId}`)
        .set(auth(adminToken))
        .send({ status: 'in_review' })
        .expect(409);
      expect(illegal.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('blocks non-admins from the report routes with 403', async () => {
      await request(info.app.getHttpServer())
        .get(ADMIN_REPORTS)
        .set(auth(volunteerToken))
        .expect(403);
      await request(info.app.getHttpServer())
        .patch(`${ADMIN_REPORTS}/${new Types.ObjectId().toString()}`)
        .set(auth(volunteerToken))
        .send({ status: 'resolved' })
        .expect(403);
    });
  });

  describe('9.3 review hiding + reliability', () => {
    let orgA: OrganizationModel;
    let orgAId: Types.ObjectId;
    let slugA: string;
    let toHideId = '';
    let connection: Awaited<ReturnType<typeof seedOpenConnection>>;

    const average = (rows: ReviewModel[]): number =>
      rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;

    beforeAll(async () => {
      connection = await seedOpenConnection(info.uri);
      const orgModel = connection.model(
        OrganizationsCollection,
        OrganizationSchema,
      );
      orgA = await orgModel.create({
        userId: new Types.ObjectId(),
        slug: `reliability-partb-${new Types.ObjectId().toString()}`,
        verificationStatus: 'verified',
        status: 'active',
      });
      slugA = orgA.slug;
      const orgB = await orgModel.create({
        userId: new Types.ObjectId(),
        slug: `platform-partb-${new Types.ObjectId().toString()}`,
        verificationStatus: 'verified',
        status: 'active',
      });
      orgAId = orgA._id;

      const reviewModel = connection.model(ReviewsCollection, ReviewSchema);
      await reviewModel.insertMany([
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgAId,
          volunteerId: new Types.ObjectId(),
          rating: 2,
          status: 'visible',
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgAId,
          volunteerId: new Types.ObjectId(),
          rating: 2,
          status: 'visible',
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgAId,
          volunteerId: new Types.ObjectId(),
          rating: 4,
          status: 'visible',
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgAId,
          volunteerId: new Types.ObjectId(),
          rating: 4,
          status: 'hidden',
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgB._id,
          volunteerId: new Types.ObjectId(),
          rating: 4,
          status: 'visible',
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: orgB._id,
          volunteerId: new Types.ObjectId(),
          rating: 1,
          status: 'hidden',
        },
      ]);
    });

    afterAll(async () => {
      if (connection) {
        await connection.close();
      }
    });

    async function expectedAnomaly(): Promise<boolean> {
      const reviewModel = connection.model(ReviewsCollection, ReviewSchema);
      const orgVisible = await reviewModel
        .find({ organizationId: orgAId, status: 'visible' })
        .select('rating')
        .exec();
      const platformVisible = await reviewModel
        .find({ status: 'visible' })
        .select('rating')
        .exec();
      return average(orgVisible) > average(platformVisible);
    }

    async function persistedAnomaly(): Promise<boolean> {
      const reliability = await info.app
        .get(ReliabilityService)
        .refresh(orgAId);
      return reliability.anomaly ?? false;
    }

    async function publicReliability(): Promise<{ anomaly?: boolean }> {
      const response = await request(info.app.getHttpServer())
        .get(`/api/v1/organizations/${slugA}/reliability`)
        .expect(200);
      return response.body as { anomaly?: boolean };
    }

    it('reliability anomaly reflects the visible-only review set', async () => {
      expect(await persistedAnomaly()).toBe(await expectedAnomaly());
      expect((await publicReliability()).anomaly).toBe(await expectedAnomaly());
    });

    it('admin hides a review and the anomaly recomputes against the visible-only set', async () => {
      const reviewModel = connection.model(ReviewsCollection, ReviewSchema);
      const target = await reviewModel
        .findOne({ organizationId: orgAId, rating: 4, status: 'visible' })
        .exec();
      toHideId = target!._id.toString();

      const hidden = await request(info.app.getHttpServer())
        .patch(`${ADMIN_REVIEWS}/${toHideId}/hide`)
        .set(auth(adminToken))
        .expect(200);
      expect(hidden.body.status).toBe('hidden');

      expect(await persistedAnomaly()).toBe(await expectedAnomaly());
      expect((await publicReliability()).anomaly).toBe(await expectedAnomaly());

      const again = await request(info.app.getHttpServer())
        .patch(`${ADMIN_REVIEWS}/${toHideId}/hide`)
        .set(auth(adminToken))
        .expect(409);
      expect(again.body.code).toBe('REVIEW_ALREADY_HIDDEN');
    });

    it('blocks non-admin hide attempts with 403', async () => {
      const volunteerToken = await registerVolunteer(
        'hide.blocked@example.com',
      );
      await request(info.app.getHttpServer())
        .patch(`${ADMIN_REVIEWS}/${new Types.ObjectId().toString()}/hide`)
        .set(auth(volunteerToken))
        .expect(403);
    });
  });

  describe('9.4 audit-log filter', () => {
    it('records the admin force-close with the actor and entity rows recoverable', async () => {
      const opportunityId = await seedOpportunity(
        new Types.ObjectId(),
        'in_progress',
        'audit',
      );

      await request(info.app.getHttpServer())
        .patch(`${ADMIN_OPPORTUNITIES}/${opportunityId}/status`)
        .set(auth(adminToken))
        .send({ status: 'closed' })
        .expect(200);

      let paths: string[] = [];
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const byActor = await request(info.app.getHttpServer())
          .get(`${ADMIN_AUDIT_LOGS}?actor=${adminId}`)
          .set(auth(adminToken))
          .expect(200);
        paths = byActor.body.items.map((row: { path: string }) => row.path);
        if (
          paths.includes(`/api/v1/admin/opportunities/${opportunityId}/status`)
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(paths).toContain(
        `/api/v1/admin/opportunities/${opportunityId}/status`,
      );

      const byEntity = await request(info.app.getHttpServer())
        .get(
          `${ADMIN_AUDIT_LOGS}?entityType=opportunities&entityId=${opportunityId}`,
        )
        .set(auth(adminToken))
        .expect(200);
      expect(
        byEntity.body.items.every(
          (row: { entityId: string }) => row.entityId === opportunityId,
        ),
      ).toBe(true);

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const byDate = await request(info.app.getHttpServer())
        .get(`${ADMIN_AUDIT_LOGS}?date=${today}`)
        .set(auth(adminToken))
        .expect(200);
      expect(byDate.body.items.length).toBeGreaterThan(0);
      const noOld = await request(info.app.getHttpServer())
        .get(`${ADMIN_AUDIT_LOGS}?date=${yesterday}`)
        .set(auth(adminToken))
        .expect(200);
      expect(noOld.body.items).toEqual([]);
    });
  });

  describe('9.5 force-close opportunities', () => {
    let orgId: Types.ObjectId;
    let opportunityId: string;

    beforeEach(async () => {
      orgId = new Types.ObjectId();
      opportunityId = await seedOpportunity(orgId, 'in_progress', 'force');
    });

    it('forces an in_progress opportunity to closed and writes a history row', async () => {
      const response = await request(info.app.getHttpServer())
        .patch(`${ADMIN_OPPORTUNITIES}/${opportunityId}/status`)
        .set(auth(adminToken))
        .send({ status: 'closed' })
        .expect(200);
      expect(response.body.status).toBe('closed');

      const connection = await seedOpenConnection(info.uri);
      try {
        const historyModel = connection.model(
          StatusHistoryCollection,
          StatusHistorySchema,
        );
        const rows = await historyModel
          .find({ entityType: 'opportunity' })
          .exec();
        expect(rows.some((row) => row.to === 'closed')).toBe(true);
      } finally {
        await connection.close();
      }
    });

    it('rejects a draft → closed jump with 409 (whitelist)', async () => {
      const draftId = await seedOpportunity(orgId, 'draft', 'force-draft');
      const response = await request(info.app.getHttpServer())
        .patch(`${ADMIN_OPPORTUNITIES}/${draftId}/status`)
        .set(auth(adminToken))
        .send({ status: 'closed' })
        .expect(409);
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects a no-op with 409', async () => {
      const closedId = await seedOpportunity(orgId, 'closed', 'force-noop');
      const response = await request(info.app.getHttpServer())
        .patch(`${ADMIN_OPPORTUNITIES}/${closedId}/status`)
        .set(auth(adminToken))
        .send({ status: 'closed' })
        .expect(409);
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('404s for an unknown opportunity', async () => {
      const response = await request(info.app.getHttpServer())
        .patch(
          `${ADMIN_OPPORTUNITIES}/${new Types.ObjectId().toString()}/status`,
        )
        .set(auth(adminToken))
        .send({ status: 'closed' })
        .expect(404);
      expect(response.body.code).toBe('OPPORTUNITY_NOT_FOUND');
    });
  });

  describe('9.6 settings + publish-gate regression', () => {
    it('upserts the threshold, lists it, and locks the second publish', async () => {
      const orgToken = await registerOrg('gate.partb@org.test');
      const organization = await ownOrganization(orgToken);

      const connection = await seedOpenConnection(info.uri);
      try {
        const orgModel = connection.model(
          OrganizationsCollection,
          OrganizationSchema,
        );
        await orgModel
          .updateOne(
            { _id: organization._id },
            { $set: { verificationStatus: 'verified', status: 'active' } },
          )
          .exec();
      } finally {
        await connection.close();
      }

      const opportunityA = await request(info.app.getHttpServer())
        .post(ORG_ME_OPPORTUNITIES)
        .set(auth(orgToken))
        .send(OPPORTUNITY_PAYLOAD)
        .expect(201);
      await request(info.app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunityA.body._id}/publish`)
        .set(auth(orgToken))
        .expect(200);

      const submitConnection = await seedOpenConnection(info.uri);
      try {
        const submissionModel = submitConnection.model<SubmissionModel>(
          SubmissionsCollection,
          SubmissionSchema,
        );
        await submissionModel.create({
          participantId: new Types.ObjectId(),
          opportunityId: opportunityA.body._id,
          positionId: new Types.ObjectId(),
          organizationId: organization._id,
          volunteerId: new Types.ObjectId(),
          status: 'submitted',
        });
      } finally {
        await submitConnection.close();
      }

      const upsert = await request(info.app.getHttpServer())
        .put(`${ADMIN_SETTINGS}/publishGate.maxPendingOpportunities`)
        .set(auth(adminToken))
        .send({ value: 1 })
        .expect(200);
      expect(upsert.body.value).toBe(1);

      const listed = await request(info.app.getHttpServer())
        .get(ADMIN_SETTINGS)
        .set(auth(adminToken))
        .expect(200);
      expect(
        listed.body.some(
          (row: { key: string; value: number }) =>
            row.key === 'publishGate.maxPendingOpportunities' &&
            row.value === 1,
        ),
      ).toBe(true);

      const opportunityB = await request(info.app.getHttpServer())
        .post(ORG_ME_OPPORTUNITIES)
        .set(auth(orgToken))
        .send(OPPORTUNITY_PAYLOAD)
        .expect(201);
      const locked = await request(info.app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunityB.body._id}/publish`)
        .set(auth(orgToken))
        .expect(409);
      expect(locked.body.code).toBe('PUBLISH_GATE_LOCKED');
    });

    it('rejects an unknown setting key with 400', async () => {
      const response = await request(info.app.getHttpServer())
        .put(`${ADMIN_SETTINGS}/publishGate.maxOrganizationAvatars`)
        .set(auth(adminToken))
        .send({ value: 1 })
        .expect(400);
      expect(response.body.code).toBe('UNKNOWN_SETTING_KEY');
    });
  });
});
