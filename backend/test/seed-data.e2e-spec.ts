import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../src/organizations/schemas/organization.schema';
import { MediaCollection, MediaModel } from '../src/media/schemas/media.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../src/organizations/schemas/organization-verification.schema';
import {
  LocationsCollection,
  LocationModel,
} from '../src/locations/schemas/location.schema';
import { MUNICIPALITY_SEEDS, WILAYA_SEEDS } from '../src/seed-data/locations';
import { SKILL_CATEGORY_SEEDS, SKILL_SEEDS } from '../src/seed-data/skills';
import { seedLocations, seedSkills } from '../src/seed-data/seed.utils';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../src/skills/schemas/skill-category.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../src/skills/schemas/skill.schema';
import { UsersCollection } from '../src/users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../src/volunteers/schemas/volunteer-skill.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { UsersService } from '../src/users/users.service';
import { seedAdmin } from '../src/scripts/seed-admin';
import { seedDemo } from '../src/scripts/seed-demo';

const LOGIN = '/api/v1/auth/login';
const ADMIN_EMAIL = 'root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';
const DEMO_ORG_EMAIL = 'demo-org@basmatak.test';
const DEMO_ORG_PASSWORD = 'DemoOrg123!';

describe('seed-data e2e — seed:all smoke (F1 closure)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let locationModel: Model<LocationModel>;
  let categoryModel: Model<SkillCategoryModel>;
  let skillModel: Model<SkillModel>;
  let mediaModel: Model<MediaModel>;
  let profileModel: Model<VolunteerProfileModel>;
  let skillRowModel: Model<VolunteerSkillModel>;

  async function seedAll(): Promise<void> {
    await seedLocations(locationModel);
    const categories = app.get(
      getModelToken(SkillCategoriesCollection),
    ) as Model<SkillCategoryModel>;
    const skills = app.get(
      getModelToken(SkillsCollection),
    ) as Model<SkillModel>;
    await seedSkills(categories, skills);
    await seedAdmin(app);
    await seedDemo(app);
  }

  beforeAll(async () => {
    handle = await createTestApp([], {
      env: {
        THROTTLE_LIMIT: '100000',
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
      },
    });
    app = handle.app;
    locationModel = app.get(getModelToken(LocationsCollection));
    categoryModel = app.get(getModelToken(SkillCategoriesCollection));
    skillModel = app.get(getModelToken(SkillsCollection));
    mediaModel = app.get(getModelToken(MediaCollection));
    profileModel = app.get(getModelToken(VolunteerProfilesCollection));
    skillRowModel = app.get(getModelToken(VolunteerSkillsCollection));
    await seedAll();
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  it('seeded the full reference dataset', async () => {
    const locations = await locationModel
      .find({ type: 'wilaya' })
      .countDocuments()
      .exec();
    expect(locations).toBe(WILAYA_SEEDS.length);

    const municipalities = await locationModel
      .find({ type: 'municipality' })
      .countDocuments()
      .exec();
    expect(municipalities).toBe(MUNICIPALITY_SEEDS.length);

    const categories = await categoryModel.countDocuments().exec();
    expect(categories).toBe(SKILL_CATEGORY_SEEDS.length);

    const skills = await skillModel.countDocuments().exec();
    expect(skills).toBe(SKILL_SEEDS.length);
  });

  it('seeded exactly one admin', async () => {
    const users = app.get(UsersService);
    const admin = await users.findByEmail(ADMIN_EMAIL);
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');

    const otherAdmins = await app
      .get(getModelToken(UsersCollection))
      .countDocuments({ role: 'admin' })
      .exec();
    expect(otherAdmins).toBe(1);
  });

  it('seeded one verified demo organization via the S15 approve path', async () => {
    const users = app.get(UsersService);
    const orgUser = await users.findByEmail(DEMO_ORG_EMAIL);
    expect(orgUser).not.toBeNull();

    const organization = await app
      .get(getModelToken(OrganizationsCollection))
      .findOne({ userId: orgUser!._id })
      .exec();
    expect(organization).not.toBeNull();
    expect((organization as OrganizationModel).verificationStatus).toBe(
      'verified',
    );
    expect((organization as OrganizationModel).status).toBe('active');

    const pendingRow = await app
      .get(getModelToken(OrganizationVerificationsCollection))
      .find({ organizationId: (organization as OrganizationModel)._id })
      .exec();
    const decided = pendingRow.filter(
      (row: OrganizationVerificationModel) => row.status === 'verified',
    );
    expect(decided.length).toBeGreaterThanOrEqual(1);
  });

  it('seeded one demo volunteer with catalog skills', async () => {
    const users = app.get(UsersService);
    const volunteer = await users.findByEmail('demo-volunteer@basmatak.test');
    expect(volunteer).not.toBeNull();

    const profile = await profileModel
      .findOne({ userId: volunteer!._id })
      .exec();
    expect(profile).not.toBeNull();

    const rows = await skillRowModel
      .find({ volunteerId: volunteer!._id })
      .exec();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('the seeded admin can log in', async () => {
    const response = await request(app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    expect(response.body.accessToken).toBeDefined();
  });

  it('the verified demo org can publish (F1 closure)', async () => {
    const login = await request(app.getHttpServer())
      .post(LOGIN)
      .send({ email: DEMO_ORG_EMAIL, password: DEMO_ORG_PASSWORD })
      .expect(200);
    const token = login.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post('/api/v1/organizations/me/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Community clean-up',
        description: 'Help clean the neighborhood park',
        positions: [{ title: 'Helper', requiredCount: 2 }],
      })
      .expect(201);

    const opportunityId = created.body._id as string;
    const published = await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(published.body.status).toBe('published');

    const mediaCount = await mediaModel.countDocuments().exec();
    expect(mediaCount).toBeGreaterThanOrEqual(1);
  });
});
