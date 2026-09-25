import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import {
  FavoritesCollection,
  FavoriteSchema,
} from '../src/favorites/schemas/favorite.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  UserModel,
  UsersCollection,
  UserSchema,
} from '../src/users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../src/volunteers/schemas/volunteer-profile.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const FAVORITES = '/api/v1/favorites';

describe('favorites e2e (Session 17)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let volunteerAToken: string;
  let volunteerBToken: string;
  let opportunityId: string;
  let talentBUsername: string;

  const OPP_TITLE = 'S17 Lake Cleanup';

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    const warmup = await createConnection(info.uri).asPromise();
    try {
      await warmup.model(FavoritesCollection, FavoriteSchema).init();
    } finally {
      await warmup.close();
    }

    orgToken = await registerVerifiedOrg('s17-org@example.com');
    volunteerAToken = await registerVerifiedVolunteer('s17-a@example.com');
    volunteerBToken = await registerVerifiedVolunteer('s17-b@example.com');
    talentBUsername = await readUsername('s17-b@example.com');

    opportunityId = await createPublishedOpportunity(orgToken, OPP_TITLE);
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

  async function createPublishedOpportunity(
    token: string,
    title: string,
  ): Promise<string> {
    const created = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        positions: [
          { title: 'Shore sweeper', requiredCount: 3, requiredSkills: [] },
        ],
      })
      .expect(201);
    const id = created.body._id as string;
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return id;
  }

  async function readUsername(email: string): Promise<string> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const user = await connection
        .model<UserModel>(UsersCollection, UserSchema)
        .findOne({ email })
        .lean();
      expect(user).toBeDefined();
      const profile = await connection
        .model<VolunteerProfileModel>(
          VolunteerProfilesCollection,
          VolunteerProfileSchema,
        )
        .findOne({ userId: user!._id })
        .lean();
      expect(profile).toBeDefined();
      return profile!.username;
    } finally {
      await connection.close();
    }
  }

  describe('opportunity toggle', () => {
    it('POST creates (201), repeat is idempotent (200, one row)', async () => {
      const first = await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(201);
      expect(first.body).toEqual({ favorited: true, favoriteCount: 1 });

      const second = await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(second.body).toEqual({ favorited: true, favoriteCount: 1 });
    });

    it('POST unknown or malformed ids 404 without persisting', async () => {
      await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/${new Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(404)
        .expect((response) => {
          expect(response.body.code).toBe('OPPORTUNITY_NOT_FOUND');
        });
      await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/not-an-id`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(404);
    });

    it('guest POST is 401 (existing auth guard, no new logic)', async () => {
      await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .expect(401);
    });
  });

  describe('talent toggle', () => {
    it('POST by username creates (201), unknown username 404', async () => {
      const saved = await request(info.app.getHttpServer())
        .post(`${FAVORITES}/talents/${talentBUsername}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(201);
      expect(saved.body).toEqual({ favorited: true, favoriteCount: 1 });

      await request(info.app.getHttpServer())
        .post(`${FAVORITES}/talents/ghost-username`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(404)
        .expect((response) => {
          expect(response.body.code).toBe('VOLUNTEER_PROFILE_NOT_FOUND');
        });
    });
  });

  describe('list and counts', () => {
    it('GET /favorites lists both types with totals and summaries', async () => {
      const response = await request(info.app.getHttpServer())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(response.body.total).toBe(2);
      expect(response.body.page).toBe(1);
      expect(response.body.items).toHaveLength(2);
      const types = response.body.items.map(
        (item: { targetType: string }) => item.targetType,
      );
      expect(types.sort()).toEqual(['opportunity', 'talent']);
      const opp = response.body.items.find(
        (item: { targetType: string }) => item.targetType === 'opportunity',
      );
      expect(opp.summary).toMatchObject({ title: OPP_TITLE });
      expect(opp.summary.slug).toBeDefined();
      const talent = response.body.items.find(
        (item: { targetType: string }) => item.targetType === 'talent',
      );
      expect(talent.summary).toMatchObject({ username: talentBUsername });
    });

    it('GET /favorites honors the targetType filter', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`${FAVORITES}?targetType=talent`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].targetType).toBe('talent');
    });

    it('GET /favorites/counts returns caller totals', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`${FAVORITES}/counts`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(response.body).toEqual({ opportunity: 1, talent: 1 });
    });

    it('guest list and counts are 401', async () => {
      await request(info.app.getHttpServer()).get(FAVORITES).expect(401);
      await request(info.app.getHttpServer())
        .get(`${FAVORITES}/counts`)
        .expect(401);
    });
  });

  describe('lookup card state', () => {
    it('authed lookup returns favorited plus platform counts', async () => {
      const stranger = new Types.ObjectId().toString();
      const response = await request(info.app.getHttpServer())
        .get(
          `${FAVORITES}/lookup?targetType=opportunity&targetIds=${opportunityId},${stranger}`,
        )
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(response.body[opportunityId]).toEqual({
        favorited: true,
        favoriteCount: 1,
      });
      expect(response.body[stranger]).toEqual({
        favorited: false,
        favoriteCount: 0,
      });
    });

    it('talent lookup keys on username', async () => {
      const response = await request(info.app.getHttpServer())
        .get(
          `${FAVORITES}/lookup?targetType=talent&targetIds=${talentBUsername},ghost-username`,
        )
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(response.body[talentBUsername]).toEqual({
        favorited: true,
        favoriteCount: 1,
      });
      expect(response.body['ghost-username']).toEqual({
        favorited: false,
        favoriteCount: 0,
      });
    });

    it('guest lookup sees counts only (favorited always false)', async () => {
      const response = await request(info.app.getHttpServer())
        .get(
          `${FAVORITES}/lookup?targetType=opportunity&targetIds=${opportunityId}`,
        )
        .expect(200);
      expect(response.body[opportunityId]).toEqual({
        favorited: false,
        favoriteCount: 1,
      });
    });

    it('lookup rejects missing and oversized batches with 400', async () => {
      await request(info.app.getHttpServer())
        .get(`${FAVORITES}/lookup?targetType=opportunity`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(400);
      const many = Array.from({ length: 51 }, () =>
        new Types.ObjectId().toString(),
      ).join(',');
      await request(info.app.getHttpServer())
        .get(`${FAVORITES}/lookup?targetType=opportunity&targetIds=${many}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(400);
    });
  });

  describe('isolation and unfavorite', () => {
    it('foreign saves are invisible but raise platform counts', async () => {
      const before = await request(info.app.getHttpServer())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volunteerBToken}`)
        .expect(200);
      expect(before.body.total).toBe(0);

      await request(info.app.getHttpServer())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volunteerBToken}`)
        .expect(201);

      const after = await request(info.app.getHttpServer())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volunteerBToken}`)
        .expect(200);
      expect(after.body.total).toBe(1);

      const counts = await request(info.app.getHttpServer())
        .get(`${FAVORITES}/counts`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(counts.body).toEqual({ opportunity: 1, talent: 1 });

      const lookup = await request(info.app.getHttpServer())
        .get(
          `${FAVORITES}/lookup?targetType=opportunity&targetIds=${opportunityId}`,
        )
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(lookup.body[opportunityId]).toEqual({
        favorited: true,
        favoriteCount: 2,
      });
      // No who-favorited exposure: entries carry counts only.
      expect(Object.keys(lookup.body[opportunityId]).sort()).toEqual([
        'favoriteCount',
        'favorited',
      ]);
    });

    it('DELETE is idempotent (204 present, absent, and unknown)', async () => {
      await request(info.app.getHttpServer())
        .delete(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(204);
      await request(info.app.getHttpServer())
        .delete(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(204);
      await request(info.app.getHttpServer())
        .delete(`${FAVORITES}/talents/${talentBUsername}`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(204);
      await request(info.app.getHttpServer())
        .delete(`${FAVORITES}/talents/ghost-username`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(204);

      const list = await request(info.app.getHttpServer())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .expect(200);
      expect(list.body.total).toBe(0);
    });
  });
});
