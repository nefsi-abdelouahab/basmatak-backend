import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../../src/applications/schemas/application.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../../src/opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../src/organizations/schemas/organization.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../../src/skills/schemas/skill-category.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../../src/submissions/schemas/submission.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from '../../src/verifications/schemas/verification.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../../src/verifications/schemas/volunteer-experience.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../../src/volunteers/schemas/volunteer-profile.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../../src/participations/schemas/task-participant.schema';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import { TestMailService } from '../utils/test-mail.service';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import { CORE_LOOP_ENV, seedCoreData } from '../helpers/seed-utils';

const REGISTER_ORG = '/api/v1/auth/register/organization';
const REGISTER_VOLUNTEER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ORGS_ME = '/api/v1/organizations/me';
const PARTICIPANTS = '/api/v1/organizations/me/participants';
const STATS = '/api/v1/organizations/me/stats';

const PASSWORD = 'Password123!';

describe('org dashboard e2e (Session 16)', () => {
  let info: TestAppHandle;
  let app: INestApplication;

  let orgAToken: string;
  let orgBToken: string;
  let volunteerToken: string;
  let orgASlug: string;
  let orgBSlug: string;
  let orgAId: string;
  let orgBId: string;
  let v1Id: string;
  let v2Id: string;
  let v3Id: string;
  let v1Username: string;
  let cat1Id: string;
  let cat2Id: string;
  let cat1Name: string;
  let cat2Name: string;

  let orgs: Model<OrganizationModel>;
  let opportunities: Model<OpportunityModel>;
  let applications: Model<ApplicationModel>;
  let participants: Model<TaskParticipantModel>;
  let experiences: Model<VolunteerExperienceModel>;
  let verifications: Model<VerificationModel>;
  let submissions: Model<SubmissionModel>;
  let profiles: Model<VolunteerProfileModel>;

  const oppIds = new Map<string, Types.ObjectId>();
  const positionIds = new Map<string, Types.ObjectId>();

  beforeAll(async () => {
    const mail = new TestMailService();
    info = await createTestApp([], {
      env: CORE_LOOP_ENV,
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = info.app;
    await seedCoreData(app);

    orgs = app.get(getModelToken(OrganizationsCollection));
    opportunities = app.get(getModelToken(OpportunitiesCollection));
    applications = app.get(getModelToken(ApplicationsCollection));
    participants = app.get(getModelToken(TaskParticipantsCollection));
    experiences = app.get(getModelToken(VolunteerExperiencesCollection));
    verifications = app.get(getModelToken(VerificationsCollection));
    submissions = app.get(getModelToken(SubmissionsCollection));
    profiles = app.get(getModelToken(VolunteerProfilesCollection));

    const categories: Model<SkillCategoryModel> = app.get(
      getModelToken(SkillCategoriesCollection),
    );
    const [cat1, cat2] = await categories.find({}).limit(2).exec();
    cat1Id = cat1._id.toString();
    cat2Id = cat2._id.toString();
    cat1Name = cat1.nameFr;
    cat2Name = cat2.nameFr;

    const registerOrg = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post(REGISTER_ORG)
        .send({ email, password: PASSWORD })
        .expect(201);
      return res.body.accessToken as string;
    };
    orgAToken = await registerOrg('dash-org-a@example.com');
    orgBToken = await registerOrg('dash-org-b@example.com');

    // `/organizations/me` requires a verified email (org-facts precedent).
    for (const address of [
      'dash-org-a@example.com',
      'dash-org-b@example.com',
    ]) {
      const token = mail.sent.find(
        (row) => row.kind === 'verify' && row.to === address,
      )!.token;
      await request(app.getHttpServer())
        .post(VERIFY_EMAIL)
        .send({ token })
        .expect(204);
    }

    const registerVolunteer = async (
      email: string,
    ): Promise<{ token: string; userId: string; username: string }> => {
      const res = await request(app.getHttpServer())
        .post(REGISTER_VOLUNTEER)
        .send({ email, password: PASSWORD })
        .expect(201);
      const userId = res.body.user.id as string;
      const profile = await profiles.findOne({ userId }).exec();
      return {
        token: res.body.accessToken as string,
        userId,
        username: profile!.username,
      };
    };
    const vol1 = await registerVolunteer('dash-v1@example.com');
    const vol2 = await registerVolunteer('dash-v2@example.com');
    const vol3 = await registerVolunteer('dash-v3@example.com');
    volunteerToken = vol1.token;
    v1Id = vol1.userId;
    v2Id = vol2.userId;
    v3Id = vol3.userId;
    v1Username = vol1.username;

    const meA = await request(app.getHttpServer())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    const meB = await request(app.getHttpServer())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${orgBToken}`)
      .expect(200);
    orgASlug = meA.body.slug as string;
    orgBSlug = meB.body.slug as string;
    orgAId = meA.body._id as string;
    orgBId = meB.body._id as string;

    await orgs
      .updateOne(
        { _id: orgAId },
        {
          $set: {
            verificationStatus: 'verified',
            status: 'active',
            foundedYear: 2018,
            reliability: {
              responseRate: 0.75,
              decidedRatio: 0.5,
              medianDecisionHours: 5,
              anomaly: false,
              lastRefreshedAt: new Date(),
            },
          },
        },
      )
      .exec();
    await orgs
      .updateOne(
        { _id: orgBId },
        { $set: { verificationStatus: 'verified', status: 'active' } },
      )
      .exec();

    const position = (title: string) => ({
      title,
      description: `${title} work`,
      requiredCount: 2,
    });
    const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);
    const created = await opportunities.create([
      {
        organizationId: oid(orgAId),
        slug: 'dash-a1',
        title: 'Beach cleanup',
        description: 'Clean the beach',
        categoryId: oid(cat1Id),
        status: 'published',
        positions: [position('Cleaner')],
      },
      {
        organizationId: oid(orgAId),
        slug: 'dash-a2',
        title: 'Food drive',
        description: 'Collect food',
        categoryId: oid(cat1Id),
        status: 'in_progress',
        positions: [position('Driver')],
      },
      {
        organizationId: oid(orgAId),
        slug: 'dash-a3',
        title: 'Tree planting',
        description: 'Plant trees',
        categoryId: oid(cat2Id),
        status: 'completed',
        positions: [position('Planter')],
      },
      {
        organizationId: oid(orgAId),
        slug: 'dash-a4',
        title: 'Park repair',
        description: 'Repair benches',
        categoryId: oid(cat1Id),
        status: 'closed',
        positions: [position('Carpenter')],
      },
      {
        organizationId: oid(orgAId),
        slug: 'dash-a5',
        title: 'Draft campaign',
        description: 'Not yet live',
        categoryId: oid(cat2Id),
        status: 'draft',
        positions: [position('Writer')],
      },
      {
        organizationId: oid(orgBId),
        slug: 'dash-b1',
        title: 'Org B run',
        description: 'Other org',
        categoryId: oid(cat1Id),
        status: 'published',
        positions: [position('Helper')],
      },
    ]);
    for (const opp of created) {
      oppIds.set(opp.slug, opp._id);
      positionIds.set(
        opp.slug,
        (opp.positions[0] as unknown as { _id: Types.ObjectId })._id,
      );
    }

    const rows = await participants.create([
      {
        opportunityId: oppIds.get('dash-a1'),
        positionId: positionIds.get('dash-a1'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v1Id),
        status: 'accepted',
      },
      {
        opportunityId: oppIds.get('dash-a2'),
        positionId: positionIds.get('dash-a2'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v1Id),
        status: 'active',
      },
      {
        opportunityId: oppIds.get('dash-a3'),
        positionId: positionIds.get('dash-a3'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v2Id),
        status: 'completed',
      },
      {
        opportunityId: oppIds.get('dash-a1'),
        positionId: positionIds.get('dash-a1'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v2Id),
        status: 'withdrawn',
      },
      {
        opportunityId: oppIds.get('dash-a4'),
        positionId: positionIds.get('dash-a4'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v1Id),
        status: 'removed',
      },
      {
        opportunityId: oppIds.get('dash-a2'),
        positionId: positionIds.get('dash-a2'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v2Id),
        status: 'accepted',
      },
      {
        opportunityId: oppIds.get('dash-b1'),
        positionId: positionIds.get('dash-b1'),
        applicationId: new Types.ObjectId(),
        organizationId: oid(orgBId),
        volunteerId: oid(v3Id),
        status: 'accepted',
      },
    ]);
    const participantId = (
      volunteerId: string,
      slug: string,
      status: string,
    ): Types.ObjectId =>
      rows.find(
        (row) =>
          row.volunteerId.toString() === volunteerId &&
          row.opportunityId.toString() === oppIds.get(slug)!.toString() &&
          row.status === status,
      )!._id;

    await experiences.create([
      {
        submissionId: new Types.ObjectId(),
        volunteerId: oid(v1Id),
        organizationId: oid(orgAId),
        opportunityId: oppIds.get('dash-a1'),
        positionId: positionIds.get('dash-a1'),
        title: 'Beach cleanup record',
        verificationCode: 'DASH-CODE-1',
        duration: 90,
      },
      {
        submissionId: new Types.ObjectId(),
        volunteerId: oid(v1Id),
        organizationId: oid(orgAId),
        opportunityId: oppIds.get('dash-a2'),
        positionId: positionIds.get('dash-a2'),
        title: 'Food drive record',
        verificationCode: 'DASH-CODE-2',
        duration: 60,
      },
      {
        submissionId: new Types.ObjectId(),
        volunteerId: oid(v2Id),
        organizationId: oid(orgAId),
        opportunityId: oppIds.get('dash-a3'),
        positionId: positionIds.get('dash-a3'),
        title: 'Tree planting record',
        verificationCode: 'DASH-CODE-3',
        duration: 30,
      },
    ]);

    const now = Date.now();
    await verifications.create([
      {
        submissionId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v1Id),
        status: 'verified',
        decidedAt: new Date(now - 3_600_000),
        decidedBy: oid(orgAId),
      },
      {
        submissionId: new Types.ObjectId(),
        organizationId: oid(orgAId),
        volunteerId: oid(v2Id),
        status: 'verified',
        decidedAt: new Date(now - 40 * 24 * 3_600_000),
        decidedBy: oid(orgAId),
      },
    ]);

    await applications.create([
      {
        opportunityId: oppIds.get('dash-a1'),
        positionId: positionIds.get('dash-a1'),
        volunteerId: oid(v1Id),
        organizationId: oid(orgAId),
        status: 'pending',
      },
      {
        opportunityId: oppIds.get('dash-a2'),
        positionId: positionIds.get('dash-a2'),
        volunteerId: oid(v2Id),
        organizationId: oid(orgAId),
        status: 'under_review',
      },
      {
        opportunityId: oppIds.get('dash-a3'),
        positionId: positionIds.get('dash-a3'),
        volunteerId: oid(v2Id),
        organizationId: oid(orgAId),
        status: 'accepted',
      },
    ]);

    await submissions.create([
      {
        participantId: participantId(v1Id, 'dash-a1', 'accepted'),
        opportunityId: oppIds.get('dash-a1'),
        positionId: positionIds.get('dash-a1'),
        organizationId: oid(orgAId),
        volunteerId: oid(v1Id),
        status: 'submitted',
        evidence: [{ mediaId: new Types.ObjectId() }],
      },
      {
        participantId: participantId(v2Id, 'dash-a3', 'completed'),
        opportunityId: oppIds.get('dash-a3'),
        positionId: positionIds.get('dash-a3'),
        organizationId: oid(orgAId),
        volunteerId: oid(v2Id),
        status: 'approved',
        evidence: [],
      },
    ]);
  });

  afterAll(async () => {
    await info.close();
  });

  it('reads the cross-opportunity roster with joins', async () => {
    const res = await request(app.getHttpServer())
      .get(PARTICIPANTS)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    expect(res.body.total).toBe(6);
    const accepted = (res.body.items as Array<Record<string, unknown>>).find(
      (row) =>
        row.status === 'accepted' &&
        (row.volunteer as { username: string }).username === v1Username,
    ) as unknown as {
      volunteer: { firstName: string; geographicBase: string };
      position: { title: string };
      opportunity: { title: string; slug: string; status: string };
      submission: { state: string; mediaIds: unknown[] } | null;
      hourlyTotal: number;
    };
    expect(accepted.volunteer.firstName).toBeDefined();
    expect(accepted.position.title).toBe('Cleaner');
    expect(accepted.opportunity).toMatchObject({
      title: 'Beach cleanup',
      slug: 'dash-a1',
      status: 'published',
    });
    expect(accepted.submission?.state).toBe('submitted');
    expect(accepted.submission?.mediaIds).toHaveLength(1);
    expect(accepted.hourlyTotal).toBe(90);
  });

  it('filters the roster by status, opportunity, and q', async () => {
    const completed = await request(app.getHttpServer())
      .get(`${PARTICIPANTS}?status=completed`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    expect(completed.body.total).toBe(1);

    const scoped = await request(app.getHttpServer())
      .get(`${PARTICIPANTS}?opportunityId=${oppIds.get('dash-a3')}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    expect(scoped.body.total).toBe(1);

    const byVolunteer = await request(app.getHttpServer())
      .get(`${PARTICIPANTS}?q=${encodeURIComponent(v1Username)}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    expect(byVolunteer.body.total).toBe(3);

    await request(app.getHttpServer())
      .get(`${PARTICIPANTS}?opportunityId=${oppIds.get('dash-b1')}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${PARTICIPANTS}?opportunityId=nope`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(404);
  });

  it('isolates rosters between orgs and refuses guests/volunteers', async () => {
    const orgB = await request(app.getHttpServer())
      .get(PARTICIPANTS)
      .set('Authorization', `Bearer ${orgBToken}`)
      .expect(200);
    expect(orgB.body.total).toBe(1);

    await request(app.getHttpServer()).get(PARTICIPANTS).expect(401);
    await request(app.getHttpServer())
      .get(PARTICIPANTS)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(403);
  });

  it('reads the private dashboard stats', async () => {
    const res = await request(app.getHttpServer())
      .get(STATS)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);
    expect(res.body).toEqual({
      opportunitiesActive: 2,
      opportunitiesCompleted: 2,
      applicationsPending: 1,
      applicationsUnderReview: 1,
      participantsActive: 3,
      participantsCompleted: 1,
      verifiedHours: 180,
      decisionsLast30d: 1,
      decidedRatio: 0.5,
      medianDecisionHours: 5,
    });

    const cold = await request(app.getHttpServer())
      .get(STATS)
      .set('Authorization', `Bearer ${orgBToken}`)
      .expect(200);
    expect(cold.body).toEqual({
      opportunitiesActive: 1,
      opportunitiesCompleted: 0,
      applicationsPending: 0,
      applicationsUnderReview: 0,
      participantsActive: 1,
      participantsCompleted: 0,
      verifiedHours: 0,
      decisionsLast30d: 0,
    });
  });

  it('serves real public aggregates on the org profile', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgASlug}`)
      .expect(200);
    expect(res.body.aggregates).toMatchObject({
      volunteers: 2,
      initiativesActive: 2,
      initiativesCompleted: 2,
      verifiedHours: 180,
      responseRate: 0.75,
      activeSince: 2018,
    });
    expect(res.body.aggregates.perDomain).toEqual([
      { domain: cat1Name, share: 0.75 },
      { domain: cat2Name, share: 0.25 },
    ]);

    const cold = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBSlug}`)
      .expect(200);
    expect(cold.body.aggregates).toMatchObject({
      volunteers: 1,
      initiativesActive: 1,
      initiativesCompleted: 0,
      verifiedHours: 0,
      responseRate: 0,
      activeSince: null,
    });
    expect(cold.body.aggregates.perDomain).toEqual([
      { domain: cat1Name, share: 1 },
    ]);
  });
});
