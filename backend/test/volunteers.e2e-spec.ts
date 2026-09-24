import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import {
  OrganizationsCollection,
  OrganizationModel,
} from '../src/organizations/schemas/organization.schema';
import { seedSkills } from '../src/seed-data/seed.utils';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../src/skills/schemas/skill-category.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../src/skills/schemas/skill.schema';
import {
  VolunteerAvailabilitiesCollection,
  VolunteerAvailabilityModel,
} from '../src/volunteers/schemas/volunteer-availability.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import { ReviewModel, ReviewsCollection } from '../src/reviews/review.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../src/volunteers/schemas/volunteer-skill.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

const silentMail = {
  sendVerificationEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
};

describe('volunteers e2e — profile, skills, availability, dashboard, privacy (S2)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let profileModel: Model<VolunteerProfileModel>;
  let reviewModel: Model<ReviewModel>;
  let skillModel: Model<VolunteerSkillModel>;
  let availabilityModel: Model<VolunteerAvailabilityModel>;
  let catalogSkillModel: Model<SkillModel>;
  let categoryModel: Model<SkillCategoryModel>;
  let orgModel: Model<OrganizationModel>;

  let volunteerToken: string;
  let volunteerUserId: string;
  let otherVolunteerToken: string;
  let otherVolunteerUserId: string;
  let organizationToken: string;
  let activeSkillId: string;

  const authed = (token: string, path: string) =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  const patch = (token: string, path: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    handle = await createTestApp([], {
      env: { EMAIL_VERIFICATION_REQUIRED: 'false' },
      providers: [{ token: MAIL_SERVICE, useValue: silentMail }],
    });
    app = handle.app;
    profileModel = app.get(getModelToken(VolunteerProfilesCollection));
    reviewModel = app.get(getModelToken(ReviewsCollection));
    skillModel = app.get(getModelToken(VolunteerSkillsCollection));
    availabilityModel = app.get(
      getModelToken(VolunteerAvailabilitiesCollection),
    );
    catalogSkillModel = app.get(getModelToken(SkillsCollection));
    categoryModel = app.get(getModelToken(SkillCategoriesCollection));
    orgModel = app.get(getModelToken(OrganizationsCollection));

    await seedSkills(categoryModel, catalogSkillModel);

    const register = (role: 'volunteer' | 'organization', email: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/auth/register/${role}`)
        .send({ email, password: 'Password123!' })
        .expect(201);

    const volunteer = await register('volunteer', 'profil-ben@test.dz');
    volunteerToken = volunteer.body.accessToken;
    volunteerUserId = volunteer.body.user.id;
    const other = await register('volunteer', 'second@test.dz');
    otherVolunteerToken = other.body.accessToken;
    otherVolunteerUserId = other.body.user.id;
    const org = await register('organization', 'ong@test.dz');
    organizationToken = org.body.accessToken;

    activeSkillId = (
      await request(app.getHttpServer()).get('/api/v1/skills').expect(200)
    ).body[0]._id;
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  describe('registration seam', () => {
    it('creates a public-by-default profile with a slugged username at register time', async () => {
      const profile = await profileModel
        .findOne({ userId: volunteerUserId })
        .exec();
      expect(profile).not.toBeNull();
      expect(profile!.username).toBe('profil-ben');
      expect(profile!.publicProfile.enabled).toBe(true);

      const other = await profileModel
        .findOne({ userId: otherVolunteerUserId })
        .exec();
      expect(other!.username).toBe('second');
    });

    it('still creates the organizations row for role organization (S5 regression)', async () => {
      const orgUser = await orgModel.findOne({ slug: 'ong' }).exec();
      expect(orgUser).not.toBeNull();
      expect(orgUser!.verificationStatus).toBe('pending');
    });
  });

  describe('GET /volunteers/me', () => {
    it('returns the caller profile', async () => {
      const res = await authed(volunteerToken, '/volunteers/me').expect(200);
      expect(res.body.username).toBe('profil-ben');
      expect(res.body).toMatchObject({
        publicProfile: {
          enabled: true,
          showAvatar: false,
          showBiography: true,
          showLocation: false,
          showSkills: true,
          showExperiences: true,
          showAvailability: false,
          showPortfolio: true,
          showStats: true,
        },
        stats: {
          completedTasks: 0,
          verifiedExperiences: 0,
          volunteerHours: 0,
        },
      });
    });

    it('rejects an organization account with 403 and a guest with 401', async () => {
      await authed(organizationToken, '/volunteers/me').expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/volunteers/me')
        .expect(401);
    });

    it('is scoped to the token account, not shared', async () => {
      const res = await authed(otherVolunteerToken, '/volunteers/me').expect(
        200,
      );
      expect(res.body.username).toBe('second');
    });
  });

  describe('PATCH /volunteers/me', () => {
    it('updates editable fields', async () => {
      const uploaded = await request(app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          filename: 'avatar.png',
          mimeType: 'image/png',
          size: 42000,
          purpose: 'avatar',
        })
        .expect(201);
      const avatar = uploaded.body.mediaId as string;

      const res = await patch(volunteerToken, '/volunteers/me')
        .send({
          firstName: 'Ali',
          lastName: 'Ben',
          bio: 'Bénévole secouriste',
          birthDate: '1992-07-01',
          location: { wilayaId: '16', municipalityId: '1601' },
          avatar,
        })
        .expect(200);
      expect(res.body.firstName).toBe('Ali');
      expect(res.body.avatar).toBe(avatar);
      expect(res.body.location).toEqual({
        wilayaId: '16',
        municipalityId: '1601',
      });

      const stored = await profileModel
        .findOne({ userId: volunteerUserId })
        .exec();
      expect(stored!.birthDate).toBeInstanceOf(Date);
    });

    it('rejects an avatar that is absent or owned by someone else (F9)', async () => {
      const foreignAvatar = await request(app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${otherVolunteerToken}`)
        .send({
          filename: 'foreign.png',
          mimeType: 'image/png',
          size: 42000,
          purpose: 'avatar',
        })
        .expect(201);

      const absent = await patch(volunteerToken, '/volunteers/me')
        .send({ avatar: new Types.ObjectId().toString() })
        .expect(404);
      expect(absent.body.code).toBe('MEDIA_NOT_FOUND');

      const foreign = await patch(volunteerToken, '/volunteers/me')
        .send({ avatar: foreignAvatar.body.mediaId })
        .expect(404);
      expect(foreign.body.code).toBe('MEDIA_NOT_FOUND');
    });

    it('rejects non-whitelisted keys like username or userId', async () => {
      const res = await patch(volunteerToken, '/volunteers/me')
        .send({ username: 'hacker' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a malformed location code', async () => {
      const res = await patch(volunteerToken, '/volunteers/me')
        .send({ location: { wilayaId: 'ABC', municipalityId: '1601' } })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /volunteers/me/public-settings', () => {
    it('flips the A5 privacy flags but nothing else', async () => {
      const updated = await patch(
        volunteerToken,
        '/volunteers/me/public-settings',
      )
        .send({ publicProfile: { enabled: true, showSkills: true } })
        .expect(200);
      expect(updated.body.publicProfile.enabled).toBe(true);
      expect(updated.body.publicProfile.showSkills).toBe(true);

      const res = await authed(volunteerToken, '/volunteers/me').expect(200);
      expect(res.body.publicProfile.enabled).toBe(true);
      expect(res.body.publicProfile.showSkills).toBe(true);
      expect(res.body.publicProfile.showAvatar).toBe(false);
    });

    it('rejects extra keys at the payload level', async () => {
      const res = await patch(volunteerToken, '/volunteers/me/public-settings')
        .send({ publicProfile: { enabled: true }, email: 'x@y.dz' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown flag names inside publicProfile', async () => {
      const res = await patch(volunteerToken, '/volunteers/me/public-settings')
        .send({ publicProfile: { enabled: true, admin: true } })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('skills CRUD', () => {
    it('adds, lists, updates and deletes a skill', async () => {
      const added = await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ skillId: activeSkillId, level: 3, isPrimary: true })
        .expect(201);
      expect(String(added.body.skillId)).toBe(activeSkillId);

      const listed = await authed(
        volunteerToken,
        '/volunteers/me/skills',
      ).expect(200);
      expect(listed.body).toHaveLength(1);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/volunteers/me/skills/${added.body._id}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ level: 5, yearsOfExperience: 3 })
        .expect(200);
      expect(updated.body.level).toBe(5);

      await request(app.getHttpServer())
        .delete(`/api/v1/volunteers/me/skills/${added.body._id}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(204);

      const remaining = await authed(
        volunteerToken,
        '/volunteers/me/skills',
      ).expect(200);
      expect(remaining.body).toHaveLength(0);
    });

    it('rejects a duplicate skill with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ skillId: activeSkillId, level: 2 })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ skillId: activeSkillId, level: 4 })
        .expect(409);
      expect(res.body.code).toBe('SKILL_ALREADY_ADDED');
    });

    it('rejects an inactive or unknown skill with 404', async () => {
      const inactiveId = new Types.ObjectId();
      await catalogSkillModel.create({
        _id: inactiveId,
        slug: 'zz-inactive-skill',
        categoryId: new Types.ObjectId(),
        nameAr: 'مهارة معطلة',
        nameFr: 'Compétence inactive',
        order: 999,
        active: false,
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ skillId: inactiveId.toString(), level: 1 })
        .expect(404);
      expect(res.body.code).toBe('SKILL_NOT_FOUND');

      await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ skillId: new Types.ObjectId().toString(), level: 1 })
        .expect(404);
    });

    it('keeps at most one primary skill', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${otherVolunteerToken}`)
        .send({ skillId: activeSkillId, level: 2, isPrimary: true })
        .expect(201);

      const secondSkill = await catalogSkillModel
        .findOne({ active: true })
        .exec();
      const second = await request(app.getHttpServer())
        .post('/api/v1/volunteers/me/skills')
        .set('Authorization', `Bearer ${otherVolunteerToken}`)
        .send({
          skillId: secondSkill!._id.toString(),
          level: 4,
          isPrimary: true,
        })
        .expect(201);

      const primaries = await skillModel
        .find({ volunteerId: otherVolunteerUserId, isPrimary: true })
        .exec();
      expect(primaries).toHaveLength(1);
      expect(primaries[0]._id.toString()).toBe(second.body._id);
    });
  });

  describe('availability', () => {
    it('returns an empty schedule before any PUT', async () => {
      const res = await authed(
        volunteerToken,
        '/volunteers/me/availability',
      ).expect(200);
      expect(res.body).toEqual({
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      });
    });

    it('PUT replaces the whole weekly schedule', async () => {
      const schedule = {
        monday: [{ from: '09:00', to: '12:00' }],
        tuesday: [],
        wednesday: [],
        thursday: [{ from: '14:00', to: '18:00' }],
        friday: [],
        saturday: [{ from: '08:00', to: '13:00' }],
        sunday: [],
      };
      const put = await request(app.getHttpServer())
        .put('/api/v1/volunteers/me/availability')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send(schedule)
        .expect(200);
      expect(put.body.monday).toEqual([{ from: '09:00', to: '12:00' }]);

      const stored = await availabilityModel
        .findOne({ volunteerId: volunteerUserId })
        .exec();
      expect(
        (
          stored!.schedule.saturday as unknown as Array<{
            from: string;
            to: string;
          }>
        ).map((slot) => ({ from: slot.from, to: slot.to })),
      ).toEqual([{ from: '08:00', to: '13:00' }]);

      const replacement = {
        monday: [{ from: '18:00', to: '20:00' }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      };
      await request(app.getHttpServer())
        .put('/api/v1/volunteers/me/availability')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send(replacement)
        .expect(200);

      const res = await authed(
        volunteerToken,
        '/volunteers/me/availability',
      ).expect(200);
      expect(res.body.monday).toEqual([{ from: '18:00', to: '20:00' }]);
      expect(res.body.saturday).toEqual([]);
    });

    it('rejects invalid times and a missing day', async () => {
      const bad = {
        monday: [{ from: '25:00', to: '17:00' }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      };
      const time = await request(app.getHttpServer())
        .put('/api/v1/volunteers/me/availability')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send(bad)
        .expect(400);
      expect(time.body.code).toBe('VALIDATION_ERROR');

      const missingDay = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
      };
      const missing = await request(app.getHttpServer())
        .put('/api/v1/volunteers/me/availability')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send(missingDay)
        .expect(400);
      expect(missing.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('dashboard', () => {
    it('exposes completion, zero stats and a null latest experience', async () => {
      const res = await authed(
        volunteerToken,
        '/volunteers/me/dashboard',
      ).expect(200);
      expect(res.body).toMatchObject({
        stats: {
          completedTasks: 0,
          verifiedExperiences: 0,
          volunteerHours: 0,
        },
        latestVerifiedExperience: null,
      });
      expect(typeof res.body.completionPercent).toBe('number');
    });
  });

  describe('public exposure (Session 9 opt-out)', () => {
    let freshToken: string;
    let freshUserId: string;
    let freshUsername: string;

    const guestGet = (path: string) =>
      request(app.getHttpServer()).get(`/api/v1${path}`);

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register/volunteer')
        .send({ email: 'fresh-public@test.dz', password: 'Password123!' })
        .expect(201);
      freshToken = res.body.accessToken;
      freshUserId = res.body.user.id;
      freshUsername = (await profileModel
        .findOne({ userId: freshUserId })
        .exec())!.username;
    });

    it('a new volunteer is public by default with stats, createdAt and registryId', async () => {
      const res = await guestGet(`/volunteers/${freshUsername}`).expect(200);
      expect(res.body.username).toBe(freshUsername);
      expect(res.body.registryId).toMatch(/^VOL-\d{6}$/);
      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(res.body.stats).toMatchObject({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(res.body.areasOfContribution).toEqual([]);
    });

    it('PATCH /volunteers/me stores the new identity fields and the public read reflects them', async () => {
      await patch(freshToken, '/volunteers/me')
        .send({
          firstName: 'Sara',
          lastName: 'Mansouri',
          headline: 'Community health volunteer',
          availabilityNote: 'Available weekends',
          preferredDomains: ['health', 'education'],
          geographicBase: 'Algiers',
        })
        .expect(200);

      const res = await guestGet(`/volunteers/${freshUsername}`).expect(200);
      expect(res.body.fullName).toBe('Sara Mansouri');
      expect(res.body.headline).toBe('Community health volunteer');
      expect(res.body.availabilityNote).toBe('Available weekends');
      expect(res.body.preferredDomains).toEqual(['health', 'education']);
      expect(res.body.geographicBase).toBe('Algiers');
    });

    it('rejects oversized identity fields with 400', async () => {
      const res = await patch(freshToken, '/volunteers/me')
        .send({ headline: 'x'.repeat(121) })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('showStats off hides stats; enabled off hides the whole profile', async () => {
      await patch(freshToken, '/volunteers/me/public-settings')
        .send({ publicProfile: { showStats: false } })
        .expect(200);
      const gated = await guestGet(`/volunteers/${freshUsername}`).expect(200);
      expect(gated.body.stats).toBeNull();
      expect(gated.body.firstName).toBe('Sara');

      await patch(freshToken, '/volunteers/me/public-settings')
        .send({ publicProfile: { enabled: false } })
        .expect(200);
      await guestGet(`/volunteers/${freshUsername}`).expect(404);
      await guestGet(`/volunteers/${freshUsername}/reviews`).expect(404);
      const talents = await guestGet('/talents').expect(200);
      expect(
        talents.body.items.map((c: { username: string }) => c.username),
      ).not.toContain(freshUsername);
    });

    it('GET /volunteers/:username/reviews lists only visible reviews with org identity', async () => {
      await patch(freshToken, '/volunteers/me/public-settings')
        .send({ publicProfile: { enabled: true, showStats: true } })
        .expect(200);
      const org = await orgModel.create({
        userId: new Types.ObjectId(),
        slug: 's9-ong',
        nameFr: 'S9 Org',
        verificationStatus: 'verified',
        status: 'active',
      });
      const mk = (status: 'visible' | 'hidden', rating: number) =>
        reviewModel.create({
          submissionId: new Types.ObjectId(),
          organizationId: org._id,
          volunteerId: new Types.ObjectId(freshUserId),
          rating,
          comment: `Review ${rating}`,
          status,
        });
      await mk('visible', 5);
      await mk('hidden', 1);
      await mk('visible', 4);

      const res = await guestGet(`/volunteers/${freshUsername}/reviews`).expect(
        200,
      );
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((r: { rating: number }) => r.rating)).toEqual([
        4, 5,
      ]);
      expect(res.body.items[0]).toMatchObject({
        comment: 'Review 4',
        organization: expect.objectContaining({ slug: 's9-ong' }),
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('Review 1');
    });
  });
});
