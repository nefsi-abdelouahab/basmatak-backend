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
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../src/participations/schemas/task-participant.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../src/submissions/schemas/submission.schema';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../src/skills/schemas/skill-category.schema';
import {
  LocationsCollection,
  LocationSchema,
} from '../src/locations/schemas/location.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import { UserSchema, UsersCollection } from '../src/users/schemas/user.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';

describe('org-embed-labels e2e (Session 19)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let volunteerAToken: string;
  let volunteerBToken: string;
  let opportunityId: string;
  let positionId: string;
  let applicationId: string;
  let talentAUsername: string;
  let orgSlug: string;

  const OPP_TITLE = 'S19 River Cleanup';

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    orgToken = await registerVerifiedOrg('s19-org@example.com');
    orgSlug = 's19-org';
    volunteerAToken = await registerVerifiedVolunteer('s19-a@example.com');
    volunteerBToken = await registerVerifiedVolunteer('s19-b@example.com');
    talentAUsername = await readUsername('s19-a@example.com');

    await seedReferenceData();
    opportunityId = await createPublishedOpportunity(orgToken, OPP_TITLE);
    applicationId = await applyAndAccept();
    await seedSubmission();
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  function server() {
    return request(info.app.getHttpServer());
  }

  async function register(email: string, endpoint: string): Promise<string> {
    const response = await server()
      .post(endpoint)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await server().post(VERIFY_EMAIL).send({ token: record.token }).expect(204);
  }

  async function withDb<T>(
    fn: (
      connection: Awaited<ReturnType<typeof createConnection>>,
    ) => Promise<T>,
  ): Promise<T> {
    const connection = await createConnection(info.uri);
    try {
      return await fn(connection);
    } finally {
      await connection.close();
    }
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await register(email, ORG_REGISTER);
    await verifyLatestEmail();
    await withDb(async (connection) => {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne(
          { slug: email.split('@')[0] },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();
    });
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(email, VOLUNTEER_REGISTER);
    await verifyLatestEmail();
    return token;
  }

  async function readUsername(email: string): Promise<string> {
    return withDb(async (connection) => {
      const user = await connection
        .model(UsersCollection, UserSchema)
        .findOne({ email })
        .lean()
        .exec();
      expect(user).toBeDefined();
      const profile = await connection
        .model(VolunteerProfilesCollection, VolunteerProfileSchema)
        .findOne({ userId: user!._id })
        .lean()
        .exec();
      expect(profile).toBeDefined();
      return profile!.username;
    });
  }

  async function seedReferenceData(): Promise<void> {
    await withDb(async (connection) => {
      await connection
        .model(SkillCategoriesCollection, SkillCategorySchema)
        .create({
          slug: 's19-cat',
          nameAr: 'فئة S19',
          nameFr: 'Catégorie S19',
          order: 1,
          active: true,
        });
      await connection.model(LocationsCollection, LocationSchema).create({
        code: '16',
        type: 'wilaya',
        nameAr: 'الجزائر',
        nameFr: 'Alger',
      });
    });
  }

  async function createPublishedOpportunity(
    token: string,
    title: string,
  ): Promise<string> {
    const categoryId = await withDb(async (connection) => {
      const category = await connection
        .model(SkillCategoriesCollection, SkillCategorySchema)
        .findOne({ slug: 's19-cat' })
        .lean()
        .exec();
      return category!._id.toString();
    });
    const created = await server()
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        categoryId,
        location: { wilayaId: '16' },
        positions: [
          {
            title: 'Shore sweeper',
            description: 'Sweep the shore',
            requiredCount: 3,
            requiredSkills: [],
            deliverables: ['Field report'],
          },
        ],
      })
      .expect(201);
    const id = created.body._id as string;
    positionId = created.body.positions[0]._id as string;
    await server()
      .post(`${OPPORTUNITIES}/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return id;
  }

  async function applyAndAccept(): Promise<string> {
    const applied = await server()
      .post(
        `${OPPORTUNITIES}/${opportunityId}/positions/${positionId}/applications`,
      )
      .set('Authorization', `Bearer ${volunteerAToken}`)
      .send({ message: 'I want to help' })
      .expect(201);
    const id = applied.body._id as string;
    await server()
      .post(`/api/v1/applications/${id}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    return id;
  }

  async function seedSubmission(): Promise<void> {
    await withDb(async (connection) => {
      const participant = await connection
        .model(TaskParticipantsCollection, TaskParticipantSchema)
        .findOne({ applicationId: new Types.ObjectId(applicationId) })
        .lean()
        .exec();
      expect(participant).toBeDefined();
      const opportunity = await connection
        .model(OpportunitiesCollection, OpportunitySchema)
        .findById(opportunityId)
        .lean()
        .exec();
      await connection.model(SubmissionsCollection, SubmissionSchema).create({
        participantId: participant!._id,
        opportunityId: new Types.ObjectId(opportunityId),
        positionId: new Types.ObjectId(positionId),
        organizationId: opportunity!.organizationId,
        volunteerId: participant!.volunteerId,
        deliverables: [{ title: 'Field report' }],
        title: 'S19 field work',
        evidence: [],
        status: 'submitted',
      });
    });
  }

  it('feed cards carry the org embed, labels and guest favorites state', async () => {
    const response = await server().get(OPPORTUNITIES).expect(200);
    const item = response.body.items.find(
      (row: { _id: string }) => row._id === opportunityId,
    );
    expect(item).toBeDefined();
    expect(item.organization).toMatchObject({
      slug: orgSlug,
      verificationStatus: 'verified',
    });
    expect(item.organization.nameFr ?? item.organization.nameAr).toBeDefined();
    expect(item.categoryName).toMatchObject({ nameFr: 'Catégorie S19' });
    expect(item.locationLabels).toMatchObject({
      wilaya: { nameFr: 'Alger' },
    });
    expect(item.isFavorited).toBe(false);
    expect(item.favoriteCount).toBe(0);
  });

  it('public detail carries counts, assigned names and favorites state', async () => {
    const response = await server()
      .get(`${OPPORTUNITIES}/${opportunityId}`)
      .expect(200);
    expect(response.body.organization).toMatchObject({ slug: orgSlug });
    const position = response.body.positions[0];
    expect(position.applicationCount).toBe(1);
    expect(position.assigned).toHaveLength(1);
    expect(position.assigned[0].username).toBe(talentAUsername);
    expect(response.body.isFavorited).toBe(false);
  });

  it('authed favorites reflect saves on feed, detail, talents and profile', async () => {
    await server()
      .post(`/api/v1/favorites/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(201);
    await server()
      .post(`/api/v1/favorites/talents/${talentAUsername}`)
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(201);

    const feed = await server()
      .get(OPPORTUNITIES)
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(200);
    const card = feed.body.items.find(
      (row: { _id: string }) => row._id === opportunityId,
    );
    expect(card.isFavorited).toBe(true);
    expect(card.favoriteCount).toBe(1);

    const detail = await server()
      .get(`${OPPORTUNITIES}/${opportunityId}`)
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(200);
    expect(detail.body.isFavorited).toBe(true);

    const talents = await server()
      .get('/api/v1/talents')
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(200);
    const talent = talents.body.items.find(
      (row: { username: string }) => row.username === talentAUsername,
    );
    expect(talent.isFavorited).toBe(true);
    expect(talent.favoriteCount).toBe(1);

    const profile = await server()
      .get(`/api/v1/volunteers/${talentAUsername}`)
      .set('Authorization', `Bearer ${volunteerBToken}`)
      .expect(200);
    expect(profile.body.isFavorited).toBe(true);
    expect(profile.body.favoriteCount).toBe(1);

    // Guests still see counts with favorited:false.
    const guestTalents = await server().get('/api/v1/talents').expect(200);
    const guestTalent = guestTalents.body.items.find(
      (row: { username: string }) => row.username === talentAUsername,
    );
    expect(guestTalent.isFavorited).toBe(false);
    expect(guestTalent.favoriteCount).toBe(1);
  });

  it('org own list rows carry counts and assigned names (Q1)', async () => {
    const response = await server()
      .get(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const item = response.body.items.find(
      (row: { _id: string }) => row._id === opportunityId,
    );
    expect(item.positions[0].applicationCount).toBe(1);
    expect(item.positions[0].assigned).toHaveLength(1);
    expect(item.positions[0].assigned[0].username).toBe(talentAUsername);
    expect(item.organization.slug).toBe(orgSlug);
  });

  it('application reads join names and the decision actor', async () => {
    const mine = await server()
      .get('/api/v1/applications/me')
      .set('Authorization', `Bearer ${volunteerAToken}`)
      .expect(200);
    const mineItem = mine.body.items.find(
      (row: { _id: string }) => row._id === applicationId,
    );
    expect(mineItem.volunteer.username).toBe(talentAUsername);
    expect(mineItem.organization.slug).toBe(orgSlug);
    expect(mineItem.opportunity.title).toBe(OPP_TITLE);
    expect(mineItem.position.title).toBe('Shore sweeper');
    expect(mineItem.decidedBy.userId).toBeDefined();
    expect(mineItem.decidedBy.displayName).toBeTruthy();

    const inbox = await server()
      .get('/api/v1/organizations/me/applications')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const inboxItem = inbox.body.items.find(
      (row: { _id: string }) => row._id === applicationId,
    );
    expect(inboxItem.volunteer.username).toBe(talentAUsername);
    expect(inboxItem.opportunity.title).toBe(OPP_TITLE);
    expect(inboxItem.position.title).toBe('Shore sweeper');
    expect(inboxItem.decidedBy.displayName).toBeTruthy();
  });

  it('submission inbox rows join the volunteer', async () => {
    const response = await server()
      .get('/api/v1/organizations/me/submissions')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].volunteer.username).toBe(talentAUsername);
    expect(response.body.items[0].title).toBe('S19 field work');
  });

  it('rosters carry deliverables and location labels', async () => {
    const roster = await server()
      .get('/api/v1/organizations/me/participants')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const entry = roster.body.items.find(
      (row: { volunteer: { username: string } }) =>
        row.volunteer?.username === talentAUsername,
    );
    expect(entry).toBeDefined();
    expect(entry.position.deliverables).toContain('Field report');
    expect(entry.opportunity.locationLabels).toMatchObject({
      wilaya: { nameFr: 'Alger' },
    });

    const mine = await server()
      .get('/api/v1/participations/me')
      .set('Authorization', `Bearer ${volunteerAToken}`)
      .expect(200);
    const mineItem = mine.body.items.find(
      (row: { _id: string }) => row._id === entry._id,
    );
    expect(mineItem.organization.slug).toBe(orgSlug);
    expect(mineItem.opportunity.title).toBe(OPP_TITLE);
    expect(mineItem.position.deliverables).toContain('Field report');
  });
});
