import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { MediaCollection, MediaModel } from '../src/media/schemas/media.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../src/skills/schemas/skill-category.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../src/skills/schemas/skill.schema';
import { seedSkills } from '../src/seed-data/seed.utils';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../src/verifications/schemas/volunteer-experience.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

const silentMail = {
  sendVerificationEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
};

describe('public-discovery e2e (S12): talents, gated profiles, public experiences, recommended', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let profileModel: Model<VolunteerProfileModel>;
  let catalogModel: Model<SkillModel>;
  let categoryModel: Model<SkillCategoryModel>;
  let experienceModel: Model<VolunteerExperienceModel>;
  let mediaModel: Model<MediaModel>;
  let opportunityModel: Model<OpportunityModel>;

  let activeSkillId: string;

  const guests = {
    a: { token: '', userId: '', username: '' },
    c: { token: '', userId: '', username: '' },
    b: { token: '', userId: '', username: '' },
    d: { token: '', userId: '', username: '' },
  };
  let organizationToken: string;

  const guestGet = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`);
  const authedGet = (token: string, path: string) =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);
  const patch = (token: string, path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const post = (token: string, path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  async function registerVolunteer(email: string): Promise<typeof guests.a> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const profile = await profileModel
      .findOne({ userId: res.body.user.id })
      .exec();
    return {
      token: res.body.accessToken as string,
      userId: res.body.user.id as string,
      username: profile!.username,
    };
  }

  async function setFlags(
    token: string,
    publicProfile: Record<string, boolean>,
  ): Promise<void> {
    await patch(token, '/volunteers/me/public-settings', {
      publicProfile,
    }).expect(200);
  }

  async function createMedia(
    ownerId: string,
    purpose: 'avatar' | 'submission_evidence',
    visibility: 'public' | 'private',
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const row = await mediaModel.create({
      ownerId: new Types.ObjectId(ownerId),
      purpose,
      visibility,
      type: 'file',
      storageKey: `${purpose}/${ownerId}/${visibility}.png`,
      ...extra,
    });
    return row._id.toString();
  }

  async function seedExperience(
    volunteerId: string,
    title: string,
    publicVisibility: 'public' | 'private',
    evidenceIds: string[] = [],
  ): Promise<void> {
    await experienceModel.create({
      submissionId: new Types.ObjectId(),
      volunteerId: new Types.ObjectId(volunteerId),
      organizationId: new Types.ObjectId(),
      opportunityId: new Types.ObjectId(),
      positionId: new Types.ObjectId(),
      title,
      description: `${title} — description`,
      skills: [new Types.ObjectId(activeSkillId)],
      duration: 5,
      evidenceIds: evidenceIds.map((id) => new Types.ObjectId(id)),
      verificationCode: `${title.toUpperCase().replace(/[^A-Z0-9]/g, '')}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      publicVisibility,
    });
  }

  async function seedOpportunity(
    title: string,
    requiredSkills: string[],
    wilayaId?: string,
  ): Promise<void> {
    await opportunityModel.create({
      organizationId: new Types.ObjectId(),
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      description: 'Seed description',
      categoryId: new Types.ObjectId(),
      status: 'published',
      location: wilayaId ? { wilayaId } : undefined,
      positions: [
        {
          title: 'Helper',
          description: 'Seed position description',
          requiredCount: 2,
          filledCount: 0,
          requiredSkills: requiredSkills.map((id) => new Types.ObjectId(id)),
        },
      ],
    });
  }

  beforeAll(async () => {
    handle = await createTestApp([], {
      env: { EMAIL_VERIFICATION_REQUIRED: 'false', THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: silentMail }],
    });
    app = handle.app;
    profileModel = app.get(getModelToken(VolunteerProfilesCollection));
    catalogModel = app.get(getModelToken(SkillsCollection));
    categoryModel = app.get(getModelToken(SkillCategoriesCollection));
    experienceModel = app.get(getModelToken(VolunteerExperiencesCollection));
    mediaModel = app.get(getModelToken(MediaCollection));
    opportunityModel = app.get(getModelToken(OpportunitiesCollection));

    await seedSkills(categoryModel, catalogModel);
    activeSkillId = (await guestGet('/skills').expect(200)).body[0]._id;

    guests.a = await registerVolunteer('vol-a@test.dz');
    guests.c = await registerVolunteer('vol-c@test.dz');
    guests.b = await registerVolunteer('vol-b@test.dz');
    guests.d = await registerVolunteer('vol-d@test.dz');
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/organization')
      .send({ email: 'ong@test.dz', password: 'Password123!' })
      .expect(201);
    organizationToken = orgRes.body.accessToken as string;

    // Volunteer A: fully public (skills, biographical, location, experiences, avatar).
    await patch(guests.a.token, '/volunteers/me', {
      firstName: 'Ali',
      bio: 'Medic volunteer from Algiers',
      location: { wilayaId: '16', municipalityId: '1601' },
    }).expect(200);
    await setFlags(guests.a.token, {
      enabled: true,
      showAvatar: true,
      showBiography: true,
      showLocation: true,
      showSkills: true,
      showExperiences: true,
      showAvailability: false,
      showPortfolio: false,
    });
    await post(guests.a.token, '/volunteers/me/skills', {
      skillId: activeSkillId,
      level: 3,
      isPrimary: true,
    }).expect(201);
    const publicAvatar = await createMedia(guests.a.userId, 'avatar', 'public');
    await patch(guests.a.token, '/volunteers/me', {
      avatar: publicAvatar,
    }).expect(200);
    const publicEvidence = await createMedia(
      guests.a.userId,
      'submission_evidence',
      'public',
      { type: 'link', url: 'https://youtube.com/watch?v=abc' },
    );
    const privateEvidence = await createMedia(
      guests.a.userId,
      'submission_evidence',
      'private',
    );
    await seedExperience(guests.a.userId, 'Well project', 'public', [
      publicEvidence,
      privateEvidence,
    ]);
    await seedExperience(guests.a.userId, 'Secret thing', 'private');

    // Volunteer C: enabled but partial (only biography + a private avatar).
    await patch(guests.c.token, '/volunteers/me', {
      firstName: 'Yacine',
      location: { wilayaId: '31', municipalityId: '3101' },
    }).expect(200);
    await setFlags(guests.c.token, {
      enabled: true,
      showAvatar: true,
      showBiography: true,
      showLocation: false,
      showSkills: false,
      showExperiences: false,
      showAvailability: false,
      showPortfolio: false,
      showStats: false,
    });
    const privateAvatar = await createMedia(
      guests.c.userId,
      'avatar',
      'private',
    );
    await patch(guests.c.token, '/volunteers/me', {
      avatar: privateAvatar,
    }).expect(200);

    // Volunteer B: disabled, with a skill and a public experience that must never surface.
    await setFlags(guests.b.token, { enabled: false });
    await post(guests.b.token, '/volunteers/me/skills', {
      skillId: activeSkillId,
      level: 4,
    }).expect(201);
    await seedExperience(guests.b.userId, 'Hidden public', 'public');

    // Opportunities for the recommended feed.
    await seedOpportunity('Op Algiers', [activeSkillId], '16');
    await seedOpportunity('Op Oran', [], '31');
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  describe('talents feed', () => {
    it('guest GET /talents lists only enabled profiles (A, C and D, not B)', async () => {
      const res = await guestGet('/talents').expect(200);
      const usernames = res.body.items.map(
        (card: { username: string }) => card.username,
      );
      expect(usernames).toContain(guests.a.username);
      expect(usernames).toContain(guests.c.username);
      expect(usernames).toContain(guests.d.username);
      expect(usernames).not.toContain(guests.b.username);
      expect(res.body.limit).toBe(20);
    });

    it('respects the q / wilayaId / skillId filters', async () => {
      const byBio = await guestGet(
        `/talents?q=${encodeURIComponent('medic')}`,
      ).expect(200);
      expect(
        byBio.body.items.map((card: { username: string }) => card.username),
      ).toEqual([guests.a.username]);

      const byWilaya = await guestGet(`/talents?wilayaId=16`).expect(200);
      expect(
        byWilaya.body.items.map((card: { username: string }) => card.username),
      ).toEqual([guests.a.username]);

      const bySkill = await guestGet(
        `/talents?skillId=${activeSkillId}`,
      ).expect(200);
      expect(
        bySkill.body.items.map((card: { username: string }) => card.username),
      ).toEqual([guests.a.username]);
    });

    it('talent cards are a public-safety projection with flagged avatar', async () => {
      const res = await guestGet('/talents').expect(200);
      const cardA = res.body.items.find(
        (card: { username: string }) => card.username === guests.a.username,
      );
      expect(cardA).toMatchObject({
        username: guests.a.username,
        firstName: 'Ali',
        bio: 'Medic volunteer from Algiers',
        location: { wilayaId: '16' },
      });
      expect(cardA.avatar).not.toBeNull();
      expect(cardA.skills).toEqual([
        expect.objectContaining({ skillId: activeSkillId, isPrimary: true }),
      ]);
      expect(cardA.stats).toMatchObject({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });

      const cardC = res.body.items.find(
        (card: { username: string }) => card.username === guests.c.username,
      );
      expect(cardC.avatar).toBeNull();
      expect(cardC.skills).toBeNull();
      expect(cardC.stats).toBeNull();

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('@test.dz');
      expect(serialized).not.toContain('"userId"');
      expect(serialized).not.toContain('birthDate');
    });
  });

  describe('public profile page', () => {
    it('GET /volunteers/:username opens flagged sections from live data', async () => {
      const res = await guestGet(`/volunteers/${guests.a.username}`).expect(
        200,
      );
      expect(res.body.username).toBe(guests.a.username);
      expect(res.body.firstName).toBe('Ali');
      expect(res.body.bio).toBe('Medic volunteer from Algiers');
      expect(res.body.location).toMatchObject({ wilayaId: '16' });
      expect(res.body.skills).toEqual([
        expect.objectContaining({ skillId: activeSkillId }),
      ]);
      expect(res.body.experiences).toEqual([
        expect.objectContaining({ title: 'Well project' }),
      ]);
      expect(res.body.availability).toBeNull();
      expect(res.body.stats).toMatchObject({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(res.body.registryId).toMatch(/^VOL-\d{6}$/);
      expect(res.body.areasOfContribution).toEqual([
        expect.objectContaining({ percent: 100 }),
      ]);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('Secret thing');
      expect(serialized).not.toContain('"userId"');
      expect(serialized).not.toContain('@test.dz');
      expect(serialized).not.toContain('birthDate');
      expect(serialized).not.toContain('Community Contributions');
    });

    it('hides non-flagged sections on a partial profile (C)', async () => {
      const res = await guestGet(`/volunteers/${guests.c.username}`).expect(
        200,
      );
      expect(res.body.firstName).toBe('Yacine');
      expect(res.body.skills).toBeNull();
      expect(res.body.experiences).toBeNull();
      expect(res.body.location).toBeNull();
      expect(res.body.avatar).toBeNull();
    });

    it('404s for disabled (B) and unknown profiles', async () => {
      await guestGet(`/volunteers/${guests.b.username}`).expect(404);
      await guestGet('/volunteers/nobody').expect(404);
    });
  });

  describe('public experiences and portfolio', () => {
    it('GET /volunteers/:username/experiences lists only public rows with A6 evidence', async () => {
      const res = await guestGet(
        `/volunteers/${guests.a.username}/experiences`,
      ).expect(200);
      expect(res.body.items.map((row: { title: string }) => row.title)).toEqual(
        ['Well project'],
      );
      expect(res.body.items[0].evidence).toEqual([
        {
          mediaId: expect.any(String) as unknown as string,
          type: 'link',
          mimeType: null,
          filename: null,
          url: 'https://youtube.com/watch?v=abc',
        },
      ]);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('Secret thing');
      expect(serialized).not.toContain('private.png');
    });

    it('GET /volunteers/:username/portfolio returns the S1 seam empty shape', async () => {
      const res = await guestGet(
        `/volunteers/${guests.a.username}/portfolio`,
      ).expect(200);
      expect(res.body).toEqual({ items: [] });
    });

    it('404s on experiences/portfolio for disabled profiles', async () => {
      await guestGet(`/volunteers/${guests.b.username}/experiences`).expect(
        404,
      );
      await guestGet(`/volunteers/${guests.b.username}/portfolio`).expect(404);
      await guestGet('/volunteers/nobody/experiences').expect(404);
      await guestGet('/volunteers/nobody/portfolio').expect(404);
    });
  });

  describe('guest 401-free surface', () => {
    it('all five public routes succeed without any auth', async () => {
      await guestGet('/talents').expect(200);
      await guestGet(`/volunteers/${guests.a.username}`).expect(200);
      await guestGet(`/volunteers/${guests.a.username}/experiences`).expect(
        200,
      );
      await guestGet(`/volunteers/${guests.a.username}/portfolio`).expect(200);
      await guestGet('/opportunities').expect(200);
    });
  });

  describe('recommended feed', () => {
    it('orders deterministically and differently per volunteer', async () => {
      const first = await authedGet(
        guests.a.token,
        '/opportunities/recommended',
      ).expect(200);
      const again = await authedGet(
        guests.a.token,
        '/opportunities/recommended',
      ).expect(200);
      const aTitles = first.body.items.map(
        (item: { title: string }) => item.title,
      );
      expect(aTitles).toEqual(['Op Algiers', 'Op Oran']);
      expect(
        again.body.items.map((item: { title: string }) => item.title),
      ).toEqual(aTitles);

      const d = await authedGet(
        guests.d.token,
        '/opportunities/recommended',
      ).expect(200);
      expect(d.body.items.map((item: { title: string }) => item.title)).toEqual(
        ['Op Oran', 'Op Algiers'],
      );
    });

    it('rejects non-volunteer roles with 403', async () => {
      await authedGet(organizationToken, '/opportunities/recommended').expect(
        403,
      );
    });
  });
});
