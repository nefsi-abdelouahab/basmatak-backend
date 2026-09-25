import { createConnection, Types } from 'mongoose';
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
  SkillSchema,
  SkillsCollection,
} from '../src/skills/schemas/skill.schema';
import * as request from 'supertest';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const OPPORTUNITIES = '/api/v1/opportunities';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const JOBS_RUN = '/api/v1/internal/jobs/run';
const JOBS_KEY = process.env.JOBS_KEY ?? 'test-jobs-key';

describe('opportunities e2e (task lifecycle, feed, positions, job tick)', () => {
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

  async function registerOrg(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(ORG_REGISTER)
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

  async function insertSkill(slug = 'digging'): Promise<string> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const skill = await connection
        .model(SkillsCollection, SkillSchema)
        .create({
          slug,
          categoryId: new Types.ObjectId(),
          nameAr: slug,
          nameFr: slug,
          order: 0,
          active: true,
        });
      return skill._id.toString();
    } finally {
      await connection.close();
    }
  }

  async function uuid0(): Promise<string> {
    return new Types.ObjectId().toString();
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await registerOrg(email);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
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

  async function listFeed(query = ''): Promise<Record<string, any>[]> {
    const response = await request(info.app.getHttpServer())
      .get(`${OPPORTUNITIES}${query}`)
      .expect(200);
    return response.body.items as Record<string, any>[];
  }

  async function seedAccepted(
    opportunityId: string,
    positionId: string,
    n: number,
  ): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection.db!.collection('task_participants').insertMany(
        Array.from({ length: n }, () => ({
          opportunityId: new Types.ObjectId(opportunityId),
          positionId: new Types.ObjectId(positionId),
          applicationId: new Types.ObjectId(),
          volunteerId: new Types.ObjectId(),
          status: 'accepted',
        })),
      );
    } finally {
      await connection.close();
    }
  }

  async function setFilledCount(
    opportunityId: string,
    n: number,
  ): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OpportunitiesCollection, OpportunitySchema)
        .updateOne(
          { _id: opportunityId },
          { $set: { 'positions.$[pos].filledCount': n } },
          { arrayFilters: [{ 'pos.filledCount': { $gte: 0 } }] },
        )
        .exec();
    } finally {
      await connection.close();
    }
  }

  async function runJob(): Promise<void> {
    await request(info.app.getHttpServer())
      .post(JOBS_RUN)
      .set('X-Jobs-Key', JOBS_KEY)
      .expect(200);
  }

  describe('5.4 draft -> publish -> feed -> detail', () => {
    let token: string;
    let opportunity: Record<string, any>;

    beforeAll(async () => {
      token = await registerVerifiedOrg('reforestation@example.com');
      opportunity = await createOpportunity(token, {
        title: 'Weekend Reforestation',
        description: 'Plant 500 saplings in the Atlas foothills',
        positions: [
          { title: 'Sapling carrier', requiredCount: 3, requiredSkills: [] },
        ],
      });
    });

    it('creates a draft with slug and positions', () => {
      expect(opportunity.status).toBe('draft');
      expect(opportunity.slug).toBe('weekend-reforestation');
      expect(opportunity.positions).toHaveLength(1);
      expect(opportunity.positions[0].filledCount).toBe(0);
    });

    it('is hidden from the feed and 404s on detail while draft', async () => {
      expect(await listFeed()).toEqual([]);
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/weekend-reforestation`)
        .expect(404);
    });

    it('publishes and appears in feed/detail with hasOpenPositions', async () => {
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opportunity._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const feed = await listFeed();
      expect(feed.some((entry) => entry.slug === 'weekend-reforestation')).toBe(
        true,
      );

      const detail = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/weekend-reforestation`)
        .expect(200);
      expect(detail.body.status).toBe('published');
      expect(detail.body.positions[0].requiredCount).toBe(3);

      const byId = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/${opportunity._id}`)
        .expect(200);
      expect(byId.body.slug).toBe('weekend-reforestation');

      const open = await listFeed('?hasOpenPositions=true');
      expect(open.some((entry) => entry.slug === 'weekend-reforestation')).toBe(
        true,
      );
    });

    it('filter q matches title and category/skill/wilaya filters apply', async () => {
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?q=reforestation`)
        .expect(200)
        .then((response) => {
          expect(
            (response.body.items as Record<string, any>[]).some(
              (entry) => entry.slug === 'weekend-reforestation',
            ),
          ).toBe(true);
        });
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?q=nomatch-xyz`)
        .expect(200)
        .then((response) => {
          expect(response.body.items).toEqual([]);
        });
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?wilayaId=01`)
        .expect(200)
        .then((response) => {
          expect(response.body.items).toEqual([]);
        });
    });

    it('skillId feed filter and requiredSkills validation', async () => {
      const skillId = await insertSkill('tree-planting');
      const matched = await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Skill matched task',
          description: 'Uses the planting skill',
          positions: [
            { title: 'Planter', requiredCount: 1, requiredSkills: [skillId] },
          ],
        })
        .expect(201);
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${(matched.body as any)._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const skillFeed = await listFeed(`?skillId=${skillId}`);
      expect(
        skillFeed.some((entry) => entry.slug === 'skill-matched-task'),
      ).toBe(true);

      await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Bad skill task',
          description: 'References a missing skill',
          positions: [
            {
              title: 'Planter',
              requiredCount: 1,
              requiredSkills: [await uuid0()],
            },
          ],
        })
        .expect(400)
        .then((response) => {
          expect(response.body.code).toBe('SKILL_NOT_FOUND');
        });
    });

    it('positions add is free on draft, gated on published with accepted participants', async () => {
      const created = await createOpportunity(token, {
        title: 'Gate positions',
        description: 'Position-edit gating',
        positions: [{ title: 'P1', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${created._id}/positions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'P2', requiredCount: 2 })
        .expect(200)
        .then((response) => {
          expect(response.body.positions).toHaveLength(2);
        });

      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${created._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const seedId = (
        await createOpportunity(token, {
          title: 'Seeded opp',
          description: 'Has accepted participants',
          positions: [{ title: 'P1', requiredCount: 1, requiredSkills: [] }],
        })
      )._id;
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${seedId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const seedDetail = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/${seedId}`)
        .expect(200);
      await seedAccepted(seedId, seedDetail.body.positions[0]._id, 1);

      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${seedId}/positions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'P2', requiredCount: 1 })
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe(
            'OPPORTUNITY_HAS_ACCEPTED_PARTICIPANTS',
          );
        });
    });
  });

  describe('5.5 close / cancel / complete transitions', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerVerifiedOrg('lifecycle@example.com');
    });

    async function publishDraft(title: string): Promise<Record<string, any>> {
      const opp = await createOpportunity(token, {
        title,
        description: 'Lifecycle test',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return opp;
    }

    it('closes from published and hides it from the feed', async () => {
      const opp = await publishDraft('Close me');
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/close`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const feed = await listFeed();
      expect(feed.some((entry) => entry.slug === 'close-me')).toBe(false);
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/${opp._id}`)
        .expect(404);
    });

    it('completes from published is rejected, works from in_progress', async () => {
      const opp = await createOpportunity(token, {
        title: 'Complete me',
        description: 'Manual completion',
        startDate: new Date(Date.now() - 60_000).toISOString(),
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
        });

      await runJob();
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('cancels from in_progress after the job tick', async () => {
      const opp = await createOpportunity(token, {
        title: 'Cancel me',
        description: 'Cancelled notification path',
        startDate: new Date(Date.now() - 60_000).toISOString(),
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await runJob();
      const own = await request(info.app.getHttpServer())
        .get(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (own.body.items as Record<string, any>[]).find(
          (entry) => entry.slug === 'cancel-me',
        )!.status,
      ).toBe('in_progress');
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('5.6 publish guard (verified org required)', () => {
    it('blocks a pending org with 403 ORG_NOT_VERIFIED', async () => {
      const token = await registerOrg('pending-org@example.com');
      await verifyLatestEmail();
      const opp = await createOpportunity(token, {
        title: 'Cannot publish',
        description: 'Pending org',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403)
        .then((response) => {
          expect(response.body.code).toBe('ORG_NOT_VERIFIED');
        });
    });
  });

  describe('11 opportunity fields, single-read and duplicate', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerVerifiedOrg('fields-org@example.com');
    });

    async function createFull(title: string): Promise<Record<string, any>> {
      return createOpportunity(token, {
        title,
        description: 'Full field coverage',
        mode: 'hybrid',
        durationMinutes: 180,
        prerequisites: ['Bring gloves', 'Arrive early'],
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        positions: [
          {
            title: 'Picker',
            requiredCount: 2,
            requiredSkills: [],
            deliverables: ['Two crates a day'],
            startAt: '2026-10-02',
          },
        ],
      });
    }

    it('creates with all fields and reads them back on the own single-read (draft)', async () => {
      const opp = await createFull('Field coverage');
      expect(opp.mode).toBe('hybrid');
      expect(opp.durationMinutes).toBe(180);
      expect(opp.prerequisites).toEqual(['Bring gloves', 'Arrive early']);
      expect(opp.positions[0].deliverables).toEqual(['Two crates a day']);

      const single = await request(info.app.getHttpServer())
        .get(`${ME_OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(single.body.mode).toBe('hybrid');
      expect(single.body.durationMinutes).toBe(180);
      expect(single.body.positions[0].deliverables).toEqual([
        'Two crates a day',
      ]);
      for (const banned of [
        'perks',
        'hostLogistics',
        'accommodation',
        'languageOfRecord',
      ]) {
        expect(single.body).not.toHaveProperty(banned);
      }
    });

    it('publishes and exposes the fields on public detail and feed cards', async () => {
      const opp = await createFull('Public field exposure');
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const detail = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/${opp._id}`)
        .expect(200);
      expect(detail.body.mode).toBe('hybrid');
      expect(detail.body.durationMinutes).toBe(180);
      expect(detail.body.prerequisites).toEqual([
        'Bring gloves',
        'Arrive early',
      ]);
      expect(detail.body.positions[0].deliverables).toEqual([
        'Two crates a day',
      ]);

      const feed = await listFeed('?q=Public+field+exposure');
      const card = feed.find((entry) => entry.slug === detail.body.slug)!;
      expect(card).toBeDefined();
      expect(card.mode).toBe('hybrid');
      expect(card.durationMinutes).toBe(180);
    });

    it('rejects invalid mode, duration, date window and unknown cover', async () => {
      await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Bad mode task',
          description: 'Invalid mode',
          mode: 'teleport',
        })
        .expect(400);

      await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Bad duration task',
          description: 'Zero minutes',
          durationMinutes: 0,
        })
        .expect(400);

      await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Bad window task',
          description: 'Ends before it starts',
          startDate: '2026-10-05',
          endDate: '2026-10-01',
        })
        .expect(400)
        .then((response) => {
          expect(response.body.code).toBe('INVALID_END_DATE');
        });

      await request(info.app.getHttpServer())
        .post(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Unknown cover task',
          description: 'Missing media',
          coverMediaId: await uuid0(),
        })
        .expect(404)
        .then((response) => {
          expect(response.body.code).toBe('MEDIA_NOT_FOUND');
        });
    });

    it('locks mode once published but allows description edits', async () => {
      const opp = await createFull('Published field lock');
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mode: 'remote' })
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe('OPPORTUNITY_FIELD_LOCKED');
        });

      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Still editable after publish' })
        .expect(200)
        .then((response) => {
          expect(response.body.description).toBe(
            'Still editable after publish',
          );
        });
    });

    it('duplicates as an independent draft and hides foreign rows', async () => {
      const opp = await createFull('Duplicate source');
      const copy = await request(info.app.getHttpServer())
        .post(`${ME_OPPORTUNITIES}/${opp._id}/duplicate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(copy.body._id).not.toBe(opp._id);
      expect(copy.body.slug).not.toBe(opp.slug);
      expect(copy.body.registryId).not.toBe(opp.registryId);
      expect(copy.body.status).toBe('draft');
      expect(copy.body.mode).toBe('hybrid');
      expect(copy.body.positions[0].filledCount).toBe(0);
      expect(copy.body.positions[0].deliverables).toEqual(['Two crates a day']);

      const stranger = await registerVerifiedOrg('stranger-org@example.com');
      await request(info.app.getHttpServer())
        .get(`${ME_OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${stranger}`)
        .expect(404);
      await request(info.app.getHttpServer())
        .post(`${ME_OPPORTUNITIES}/${opp._id}/duplicate`)
        .set('Authorization', `Bearer ${stranger}`)
        .expect(404);
    });
  });

  describe('5.8 job tick activates accepted participants exactly once', () => {
    it('moves started opportunities to in_progress and participants to active, idempotently', async () => {
      const token = await registerVerifiedOrg('job-org@example.com');
      const opp = await createOpportunity(token, {
        title: 'Start date job',
        description: 'Ticker target',
        startDate: new Date(Date.now() - 60_000).toISOString(),
        positions: [{ title: 'P', requiredCount: 4, requiredSkills: [] }],
      });
      const positionId = opp.positions[0]._id;
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await seedAccepted(opp._id, positionId, 2);

      await runJob();

      const own = await request(info.app.getHttpServer())
        .get(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (own.body.items as Record<string, any>[]).find(
          (entry) => entry.slug === 'start-date-job',
        )!.status,
      ).toBe('in_progress');

      const connection = await createConnection(info.uri).asPromise();
      try {
        const countActive = await connection
          .db!.collection('task_participants')
          .countDocuments({
            opportunityId: new Types.ObjectId(opp._id),
            status: 'active',
          });
        expect(countActive).toBe(2);
      } finally {
        await connection.close();
      }

      await runJob();
      const connection2 = await createConnection(info.uri).asPromise();
      try {
        const participantDocs = await connection2
          .db!.collection('task_participants')
          .find({ opportunityId: opp._id })
          .toArray();
        expect(participantDocs.every((doc) => doc.status === 'active')).toBe(
          true,
        );
      } finally {
        await connection2.close();
      }

      const full = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/${opp._id}`)
        .expect(404);
      void full;
    });
  });

  describe('5.9 pagination clamp and cursor advance', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerVerifiedOrg('pager@example.com');
      for (const title of ['Page one', 'Page two', 'Page three']) {
        const opp = await createOpportunity(token, {
          title,
          description: 'Pagination fixture',
          positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
        });
        await request(info.app.getHttpServer())
          .post(`${OPPORTUNITIES}/${opp._id}/publish`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });

    it('clamps limit to 50 and pages by cursor', async () => {
      const first = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?limit=2`)
        .expect(200);
      expect(first.body.limit).toBe(2);
      expect((first.body.items as unknown[]).length).toBe(2);
      expect(typeof first.body.nextCursor).toBe('string');

      const second = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?limit=2&cursor=${first.body.nextCursor}`)
        .expect(200);
      expect((second.body.items as unknown[]).length).toBeGreaterThanOrEqual(1);
      const slugs = [
        ...(first.body.items as Record<string, any>[]),
        ...(second.body.items as Record<string, any>[]),
      ].map((entry) => entry.slug);
      expect(slugs).toContain('page-one');
      expect(slugs).toContain('page-two');
      expect(slugs).toContain('page-three');

      const clamped = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}?limit=999`)
        .expect(200);
      expect(clamped.body.limit).toBe(50);
    });

    it('filledCount never drops below requiredCount (seat rule over HTTP)', async () => {
      const opp = await createOpportunity(token, {
        title: 'Seat guard',
        description: 'Position seat rule',
        positions: [{ title: 'P', requiredCount: 2, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await setFilledCount(opp._id, 2);
      const positionId = opp.positions[0]._id;
      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}/positions/${positionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ requiredCount: 1 })
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe(
            'POSITION_REQUIRED_COUNT_LOWER_THAN_FILLED',
          );
        });
    });

    it('a full position is hidden from hasOpenPositions=true but visible unfiltered', async () => {
      const opp = await createOpportunity(token, {
        title: 'Seats full',
        description: 'Full position',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await setFilledCount(opp._id, 1);

      const open = await listFeed('?hasOpenPositions=true');
      expect(open.some((entry) => entry.slug === 'seats-full')).toBe(false);
      const unfiltered = await listFeed();
      expect(unfiltered.some((entry) => entry.slug === 'seats-full')).toBe(
        true,
      );
    });
  });

  describe('5.10 own-resource rules, route ordering, recommended, delete, PATCH', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerVerifiedOrg('rules@example.com');
    });

    it('me/opportunities hits the opportunities handler (cursor page), not the S5 :slug stub', async () => {
      const response = await request(info.app.getHttpServer())
        .get(ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toHaveProperty('nextCursor');
      expect(response.body).toHaveProperty('limit');
    });

    it('recommended returns a cursor page for a volunteer and 401 anonymous', async () => {
      await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/recommended`)
        .expect(401);
      const volunteer = await request(info.app.getHttpServer())
        .post(VOLUNTEER_REGISTER)
        .send({ email: 'seeker@example.com', password: 'Password123!' })
        .expect(201);
      const recommended = await request(info.app.getHttpServer())
        .get(`${OPPORTUNITIES}/recommended`)
        .set('Authorization', `Bearer ${volunteer.body.accessToken}`)
        .expect(200);
      expect(recommended.body).toHaveProperty('items');
      expect(recommended.body).toHaveProperty('nextCursor');
      expect(recommended.body).toHaveProperty('limit');
      expect(Array.isArray(recommended.body.items)).toBe(true);
    });

    it('PATCH on a published opportunity is limited and then blocked with accepted participants', async () => {
      const opp = await createOpportunity(token, {
        title: 'Patch me',
        description: 'Initially patchable',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Renamed' })
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe('OPPORTUNITY_FIELD_LOCKED');
        });

      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Touched description' })
        .expect(200)
        .then((response) => {
          expect(response.body.description).toBe('Touched description');
        });

      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'closed' })
        .expect(400)
        .then((response) => {
          expect(response.body.code).toBe('VALIDATION_ERROR');
        });

      await seedAccepted(opp._id, opp.positions[0]._id, 1);
      await request(info.app.getHttpServer())
        .patch(`${OPPORTUNITIES}/${opp._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Too late' })
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe(
            'OPPORTUNITY_HAS_ACCEPTED_PARTICIPANTS',
          );
        });
    });

    it('DELETE works only on drafts', async () => {
      const draft = await createOpportunity(token, {
        title: 'Delete the draft',
        description: 'Draft deletion',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .delete(`${OPPORTUNITIES}/${draft._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const published = await createOpportunity(token, {
        title: 'Keep published',
        description: 'Not deletable',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${published._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .delete(`${OPPORTUNITIES}/${published._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409)
        .then((response) => {
          expect(response.body.code).toBe('OPPORTUNITY_NOT_DRAFT');
        });
    });

    it('cross-org isolation returns 404', async () => {
      const other = await request(info.app.getHttpServer())
        .post(ORG_REGISTER)
        .send({ email: 'stranger@example.com', password: 'Password123!' })
        .expect(201);
      await request(info.app.getHttpServer())
        .patch(
          `${OPPORTUNITIES}/${
            (
              await createOpportunity(token, {
                title: 'Isolation',
                description: 'Owned by rules org',
                positions: [
                  { title: 'P', requiredCount: 1, requiredSkills: [] },
                ],
              })
            )._id
          }`,
        )
        .set('Authorization', `Bearer ${other.body.accessToken}`)
        .expect(404);
    });
  });

  describe('5.11 S5 organizations/:slug/opportunities returns real data', () => {
    it('lists published opportunities of a verified org', async () => {
      const token = await registerVerifiedOrg('public-org@example.com');
      const opp = await createOpportunity(token, {
        title: 'Public slug task',
        description: 'Visible on the org page',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      });
      await request(info.app.getHttpServer())
        .post(`${OPPORTUNITIES}/${opp._id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const opportunities = await request(info.app.getHttpServer())
        .get('/api/v1/organizations/public-org/opportunities')
        .expect(200);
      expect(
        (opportunities.body as Record<string, any>[]).some(
          (entry) => entry.slug === 'public-slug-task',
        ),
      ).toBe(true);
    });
  });
});

describe('opportunities e2e (publish gate demo path)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000', PUBLISH_GATE_ENABLED: 'true' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
    delete process.env.PUBLISH_GATE_ENABLED;
  });

  it('blocks publish with 409 PUBLISH_GATE_LOCKED when the gate is enabled and locked', async () => {
    const registered = await request(info.app.getHttpServer())
      .post(ORG_REGISTER)
      .send({ email: 'gated@example.com', password: 'Password123!' })
      .expect(201);
    const token = registered.body.accessToken as string;

    const verification = mail.latest('verify')!;
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: verification.token })
      .expect(204);

    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne(
          { slug: 'gated' },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();
    } finally {
      await connection.close();
    }

    const created = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Gated publish',
        description: 'Blocked by the gate',
        positions: [{ title: 'P', requiredCount: 1, requiredSkills: [] }],
      })
      .expect(201);

    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${created.body._id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409)
      .then((response) => {
        expect(response.body.code).toBe('PUBLISH_GATE_LOCKED');
      });
  });
});
