import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileModel,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillsCollection,
  VolunteerSkillModel,
} from '../src/volunteers/schemas/volunteer-skill.schema';
import {
  SkillsCollection,
  SkillModel,
} from '../src/skills/schemas/skill.schema';
import {
  ApplicationsCollection,
  ApplicationModel,
} from '../src/applications/schemas/application.schema';
import {
  VolunteerExperiencesCollection,
  VolunteerExperienceModel,
} from '../src/verifications/schemas/volunteer-experience.schema';
import {
  OrganizationsCollection,
  OrganizationModel,
} from '../src/organizations/schemas/organization.schema';
import {
  SubmissionsCollection,
  SubmissionModel,
} from '../src/submissions/schemas/submission.schema';
import {
  TaskParticipantsCollection,
  TaskParticipantModel,
} from '../src/participations/schemas/task-participant.schema';
import { UsersCollection, UserModel } from '../src/users/schemas/user.schema';
import { MediaCollection, MediaModel } from '../src/media/schemas/media.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { TestMailService } from './utils/test-mail.service';
import { MAIL_SERVICE } from '../src/mail/mail.interface';

const PASSWORD = 'Password123!';

/**
 * Session 7 acceptance paths: counted pages, multi-select semantics,
 * volunteer nearMe, talent facets vs total, submissions.title persistence,
 * and the application/experience/organization/submission query contracts
 * with ownership/visibility regressions.
 */
describe('pagination totals e2e (Session 7)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let opportunityModel: Model<OpportunityModel>;
  let profileModel: Model<VolunteerProfileModel>;
  let volunteerSkillModel: Model<VolunteerSkillModel>;
  let skillModel: Model<SkillModel>;
  let applicationModel: Model<ApplicationModel>;
  let experienceModel: Model<VolunteerExperienceModel>;
  let organizationModel: Model<OrganizationModel>;
  let submissionModel: Model<SubmissionModel>;
  let participantModel: Model<TaskParticipantModel>;
  let mediaModel: Model<MediaModel>;
  let userModel: Model<UserModel>;

  const orgId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const opportunityIds = [
    new Types.ObjectId(),
    new Types.ObjectId(),
    new Types.ObjectId(),
  ];
  let skillId: Types.ObjectId;
  let categoryId: Types.ObjectId;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    opportunityModel = info.app.get<Model<OpportunityModel>>(
      getModelToken(OpportunitiesCollection),
    );
    profileModel = info.app.get<Model<VolunteerProfileModel>>(
      getModelToken(VolunteerProfilesCollection),
    );
    volunteerSkillModel = info.app.get<Model<VolunteerSkillModel>>(
      getModelToken(VolunteerSkillsCollection),
    );
    skillModel = info.app.get<Model<SkillModel>>(
      getModelToken(SkillsCollection),
    );
    applicationModel = info.app.get<Model<ApplicationModel>>(
      getModelToken(ApplicationsCollection),
    );
    experienceModel = info.app.get<Model<VolunteerExperienceModel>>(
      getModelToken(VolunteerExperiencesCollection),
    );
    organizationModel = info.app.get<Model<OrganizationModel>>(
      getModelToken(OrganizationsCollection),
    );
    submissionModel = info.app.get<Model<SubmissionModel>>(
      getModelToken(SubmissionsCollection),
    );
    participantModel = info.app.get<Model<TaskParticipantModel>>(
      getModelToken(TaskParticipantsCollection),
    );
    mediaModel = info.app.get<Model<MediaModel>>(
      getModelToken(MediaCollection),
    );
    userModel = info.app.get<Model<UserModel>>(getModelToken(UsersCollection));

    categoryId = new Types.ObjectId();
    const skill = await skillModel.create({
      slug: 'pagination-skill',
      categoryId,
      nameAr: 'مهارة',
      nameFr: 'Competence',
      order: 1,
      active: true,
    });
    skillId = skill._id;

    // Three published opportunities across two wilayas + one draft (hidden).
    await opportunityModel.insertMany([
      {
        _id: opportunityIds[0],
        organizationId: orgId,
        slug: 'feed-alpha',
        registryId: 'OPP-000001',
        title: 'Alpha cleanup',
        description: 'Alpha description',
        status: 'published',
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        applicationDeadline: new Date('2026-02-01T00:00:00.000Z'),
        location: { wilayaId: '16', municipalityId: '1601' },
        positions: [
          {
            title: 'Helper',
            description: '',
            requiredCount: 5,
            filledCount: 0,
            requiredSkills: [skillId],
          },
        ],
      },
      {
        _id: opportunityIds[1],
        organizationId: orgId,
        slug: 'feed-beta',
        registryId: 'OPP-000002',
        title: 'Beta tutoring',
        description: 'Beta description',
        status: 'published',
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        applicationDeadline: new Date('2026-02-15T00:00:00.000Z'),
        location: { wilayaId: '31', municipalityId: '3101' },
        positions: [
          {
            title: 'Tutor',
            description: '',
            requiredCount: 5,
            filledCount: 0,
            requiredSkills: [],
          },
        ],
      },
      {
        _id: opportunityIds[2],
        organizationId: orgId,
        slug: 'feed-gamma',
        registryId: 'OPP-000003',
        title: 'Gamma cleanup',
        description: 'Gamma description',
        status: 'published',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        applicationDeadline: new Date('2026-03-01T00:00:00.000Z'),
        location: { wilayaId: '16', municipalityId: '1602' },
        positions: [
          {
            title: 'Helper',
            description: '',
            requiredCount: 5,
            filledCount: 0,
            requiredSkills: [],
          },
        ],
      },
      {
        organizationId: orgId,
        slug: 'feed-draft-hidden',
        registryId: 'OPP-000004',
        title: 'Draft hidden',
        description: 'Draft description',
        status: 'draft',
        location: { wilayaId: '16', municipalityId: '1601' },
        positions: [],
      },
    ]);

    // Two enabled talents in different wilayas; one holds the skill.
    const volunteerA = new Types.ObjectId();
    const volunteerB = new Types.ObjectId();
    await profileModel.insertMany([
      {
        userId: volunteerA,
        username: 'pagination-a',
        registryId: 'VOL-000001',
        firstName: 'Amine',
        location: { wilayaId: '16', municipalityId: '1601' },
        publicProfile: {
          enabled: true,
          showAvatar: false,
          showBiography: true,
          showLocation: true,
          showSkills: true,
          showExperiences: true,
          showAvailability: false,
          showPortfolio: false,
        },
      },
      {
        userId: volunteerB,
        username: 'pagination-b',
        registryId: 'VOL-000002',
        firstName: 'Bilal',
        location: { wilayaId: '31', municipalityId: '3101' },
        publicProfile: {
          enabled: true,
          showAvatar: false,
          showBiography: true,
          showLocation: true,
          showSkills: true,
          showExperiences: true,
          showAvailability: false,
          showPortfolio: false,
        },
      },
    ]);
    await volunteerSkillModel.create({
      volunteerId: volunteerA,
      skillId,
      level: 3,
      yearsOfExperience: 2,
      isPrimary: true,
    });

    // Organizations: one verified+active, one pending (hidden).
    await organizationModel.insertMany([
      {
        _id: orgId,
        userId: new Types.ObjectId(),
        slug: 'pagination-org',
        nameAr: 'Pagination Org',
        nameFr: 'Pagination Org',
        verificationStatus: 'verified',
        status: 'active',
      },
      {
        _id: otherOrgId,
        userId: new Types.ObjectId(),
        slug: 'pagination-pending',
        nameAr: 'Pending Org',
        nameFr: 'Pending Org',
        verificationStatus: 'pending',
        status: 'active',
      },
    ]);
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  function server() {
    return request(info.app.getHttpServer());
  }

  // Register tokens are used directly (no login: the login route is
  // throttled to 5/min and EMAIL_VERIFICATION_REQUIRED is off in tests,
  // so verification is unnecessary for these list/query contracts).
  async function registerVolunteer(email: string): Promise<{
    token: string;
    userId: string;
  }> {
    const response = await server()
      .post('/api/v1/auth/register/volunteer')
      .send({ email, password: PASSWORD })
      .expect(201);
    const user = await userModel.findOne({ email }).exec();
    return {
      token: response.body.accessToken as string,
      userId: user!._id.toString(),
    };
  }

  async function registerOrg(email: string): Promise<{
    token: string;
    userId: string;
  }> {
    const response = await server()
      .post('/api/v1/auth/register/organization')
      .send({ email, password: PASSWORD })
      .expect(201);
    const user = await userModel.findOne({ email }).exec();
    return {
      token: response.body.accessToken as string,
      userId: user!._id.toString(),
    };
  }

  it('feed returns exact totals with a non-even final page', async () => {
    const first = await server()
      .get('/api/v1/opportunities?limit=2')
      .expect(200);
    expect(first.body.total).toBe(3);
    expect(first.body.page).toBe(1);
    expect(first.body.pages).toBe(2);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await server()
      .get(
        `/api/v1/opportunities?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .expect(200);
    expect(second.body.total).toBe(3);
    expect(second.body.page).toBe(2);
    expect(second.body.pages).toBe(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('feed hides non-published rows and rejects unknown sort', async () => {
    const all = await server().get('/api/v1/opportunities').expect(200);
    expect(
      (all.body.items as Array<{ status: string }>).every(
        (row) => row.status === 'published',
      ),
    ).toBe(true);
    await server().get('/api/v1/opportunities?sort=bogus').expect(400);
    const sorted = await server()
      .get('/api/v1/opportunities?sort=startDate_asc')
      .expect(200);
    const titles = (sorted.body.items as Array<{ title: string }>).map(
      (row) => row.title,
    );
    expect(titles).toEqual(['Alpha cleanup', 'Beta tutoring', 'Gamma cleanup']);
  });

  it('feed multi-select wilaya semantics combine (OR within, total matches)', async () => {
    const single = await server()
      .get('/api/v1/opportunities?wilayaId=16')
      .expect(200);
    expect(single.body.total).toBe(2);
    const multi = await server()
      .get('/api/v1/opportunities?wilayaId=16,31')
      .expect(200);
    expect(multi.body.total).toBe(3);
    expect(multi.body.items).toHaveLength(3);
  });

  it('nearMe resolves the caller volunteer wilaya', async () => {
    const { token, userId } = await registerVolunteer('nearme-vol@example.com');
    await server()
      .patch('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: { wilayaId: '31', municipalityId: '3101' } })
      .expect(200);
    void userId;
    const near = await server()
      .get('/api/v1/opportunities?nearMe=me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(near.body.total).toBe(1);
    expect(near.body.items[0].title).toBe('Beta tutoring');
    await server().get('/api/v1/opportunities?nearMe=me').expect(401);
  });

  it('talent facets remain consistent with the filtered total', async () => {
    const response = await server().get('/api/v1/talents').expect(200);
    expect(response.body.total).toBe(2);
    expect(response.body.page).toBe(1);
    const wilayaSum = (
      response.body.facets.wilayas as Array<{ count: number }>
    ).reduce((sum, facet) => sum + facet.count, 0);
    expect(wilayaSum).toBe(response.body.total);
    const skillFacet = (
      response.body.facets.skills as Array<{
        skillId: string;
        count: number;
      }>
    ).find((facet) => facet.skillId === skillId.toString());
    expect(skillFacet?.count).toBe(1);

    const filtered = await server()
      .get(`/api/v1/talents?skillIds=${skillId.toString()}`)
      .expect(200);
    expect(filtered.body.total).toBe(1);
    await server().get('/api/v1/talents?sort=bogus').expect(400);
  });

  it('applications date range + org inbox sort/ownership', async () => {
    const volunteer = await registerVolunteer('apps-vol@example.com');
    const org = await registerOrg('apps-org@example.com');
    const orgDoc = await organizationModel
      .findOne({ userId: org.userId })
      .exec();
    const ownOrgId = orgDoc!._id;
    const now = Date.now();
    await applicationModel.insertMany([
      {
        opportunityId: opportunityIds[0],
        positionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(volunteer.userId),
        organizationId: ownOrgId,
        status: 'pending',
        createdAt: new Date(now - 30 * 24 * 3600 * 1000),
        updatedAt: new Date(now - 30 * 24 * 3600 * 1000),
      },
      {
        opportunityId: opportunityIds[1],
        positionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(volunteer.userId),
        organizationId: ownOrgId,
        status: 'pending',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
      {
        opportunityId: opportunityIds[0],
        positionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(),
        organizationId: orgId,
        status: 'pending',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ]);

    const from = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const mine = await server()
      .get(`/api/v1/applications/me?from=${encodeURIComponent(from)}`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(mine.body.total).toBe(1);

    const inbox = await server()
      .get('/api/v1/organizations/me/applications?sort=oldest')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(inbox.body.total).toBe(2);
    // Foreign org rows never leak into the inbox.
    const inboxIds = (
      inbox.body.items as Array<{ organizationId: string }>
    ).map((row) => row.organizationId.toString());
    expect(inboxIds.every((id) => id === ownOrgId.toString())).toBe(true);
    await server()
      .get('/api/v1/organizations/me/applications')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(403);
    await server()
      .get('/api/v1/organizations/me/applications?sort=bogus')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(400);
  });

  it('experiences filters narrow own rows only', async () => {
    const volunteer = await registerVolunteer('exp-vol@example.com');
    const other = await registerVolunteer('exp-other@example.com');
    const mk = (vid: string, skill: Types.ObjectId, daysAgo: number) => ({
      submissionId: new Types.ObjectId(),
      volunteerId: new Types.ObjectId(vid),
      organizationId: orgId,
      opportunityId: opportunityIds[0],
      positionId: new Types.ObjectId(),
      title: `Exp ${daysAgo}`,
      registryId: `EXP-9${daysAgo}0001`,
      skills: [skill],
      duration: 60,
      evidenceIds: [],
      verificationCode: `EXPCODE${daysAgo}${String(vid).slice(-4).toUpperCase()}`,
      publicVisibility: 'public',
      createdAt: new Date(Date.now() - daysAgo * 24 * 3600 * 1000),
      updatedAt: new Date(Date.now() - daysAgo * 24 * 3600 * 1000),
    });
    await experienceModel.insertMany([
      mk(volunteer.userId, skillId, 20),
      mk(volunteer.userId, new Types.ObjectId(), 1),
      mk(other.userId, skillId, 2),
    ]);

    const all = await server()
      .get('/api/v1/experiences/me')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(all.body.total).toBe(2);

    const bySkill = await server()
      .get(`/api/v1/experiences/me?skillId=${skillId.toString()}`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(bySkill.body.total).toBe(1);

    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const recent = await server()
      .get(`/api/v1/experiences/me?from=${encodeURIComponent(from)}`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(recent.body.total).toBe(1);
  });

  it('organizations search hides pending rows and returns counted pages', async () => {
    const response = await server()
      .get('/api/v1/organizations?q=pagination')
      .expect(200);
    const slugs = (response.body.items as Array<{ slug: string }>).map(
      (row) => row.slug,
    );
    expect(slugs).toContain('pagination-org');
    expect(slugs).not.toContain('pagination-pending');
    expect(response.body.total).toBe(1);
    expect(response.body.page).toBe(1);
  });

  it('submissions title persists and inbox multi-status/format/ownership hold', async () => {
    const volunteer = await registerVolunteer('sub-vol@example.com');
    const org = await registerOrg('sub-org@example.com');
    const orgDoc = await organizationModel
      .findOne({ userId: org.userId })
      .exec();
    const ownOrgId = orgDoc!._id;
    const opportunity = await opportunityModel
      .findById(opportunityIds[0])
      .exec();
    const positionId = opportunity!.positions[0]._id;
    const participant = await participantModel.create({
      opportunityId: opportunityIds[0],
      positionId,
      applicationId: new Types.ObjectId(),
      organizationId: ownOrgId,
      volunteerId: new Types.ObjectId(volunteer.userId),
      status: 'active',
    });

    const created = await server()
      .post(`/api/v1/participations/${participant._id.toString()}/submissions`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({ title: 'My contribution' })
      .expect(201);
    expect(created.body.title).toBe('My contribution');

    const patched = await server()
      .patch(`/api/v1/submissions/${created.body._id}`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({ title: 'Updated contribution' })
      .expect(200);
    expect(patched.body.title).toBe('Updated contribution');

    const image = await mediaModel.create({
      ownerId: new Types.ObjectId(volunteer.userId),
      purpose: 'submission_evidence',
      visibility: 'private',
      type: 'file',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
    });
    const link = await mediaModel.create({
      ownerId: new Types.ObjectId(),
      purpose: 'submission_evidence',
      visibility: 'private',
      type: 'link',
      url: 'https://youtube.com/watch?v=x',
    });
    await submissionModel.insertMany([
      {
        participantId: new Types.ObjectId(),
        opportunityId: opportunityIds[0],
        positionId: new Types.ObjectId(),
        organizationId: ownOrgId,
        volunteerId: new Types.ObjectId(volunteer.userId),
        title: 'Image work',
        deliverables: [{ title: 'Deliver' }],
        evidence: [{ mediaId: image._id }],
        status: 'submitted',
      },
      {
        participantId: new Types.ObjectId(),
        opportunityId: opportunityIds[0],
        positionId: new Types.ObjectId(),
        organizationId: ownOrgId,
        volunteerId: new Types.ObjectId(volunteer.userId),
        title: 'Video work',
        deliverables: [{ title: 'Deliver' }],
        evidence: [{ mediaId: link._id }],
        status: 'under_review',
      },
      {
        participantId: new Types.ObjectId(),
        opportunityId: opportunityIds[0],
        positionId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: new Types.ObjectId(),
        title: 'Foreign work',
        deliverables: [{ title: 'Deliver' }],
        evidence: [],
        status: 'submitted',
      },
    ]);

    const multi = await server()
      .get('/api/v1/organizations/me/submissions?status=submitted,under_review')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(multi.body.total).toBe(2);

    const images = await server()
      .get('/api/v1/organizations/me/submissions?format=image')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(images.body.total).toBe(1);
    expect(images.body.items[0].title).toBe('Image work');

    const foreignIds = (
      multi.body.items as Array<{ organizationId: string }>
    ).map((row) => row.organizationId.toString());
    expect(foreignIds.every((id) => id === ownOrgId.toString())).toBe(true);
    await server()
      .get('/api/v1/organizations/me/submissions')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(403);
  });
});
