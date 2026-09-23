import { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocationsCollection,
  LocationModel,
} from '../../src/locations/schemas/location.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../../src/skills/schemas/skill-category.schema';
import {
  SkillsCollection,
  SkillModel,
} from '../../src/skills/schemas/skill.schema';
import { seedLocations, seedSkills } from '../../src/seed-data/seed.utils';
import { seedAdmin, SeedAdminOptions } from '../../src/scripts/seed-admin';
import { seedDemo } from '../../src/scripts/seed-demo';
import { UsersService } from '../../src/users/users.service';

export const CORE_ADMIN_EMAIL = 'root@admin.test';
export const CORE_ADMIN_PASSWORD = 'AdminStrong123!';
export const CORE_JOBS_KEY = 'test-jobs-key';

/**
 * Env overrides pinned for the Session 18 core-loop app. `/backend/.env` sets
 * `ADMIN_EMAIL=admin@example.com`, so the admin bootstrap creds MUST come from
 * here (they match the seed-admin.ts defaults). `EMAIL_VERIFICATION_REQUIRED`
 * turns on the D3 gate used by the negative probes, and `STORAGE_PROVIDER=local`
 * pins the disk provider even if `.env` carries Supabase creds.
 */
export const CORE_LOOP_ENV: Record<string, string> = {
  THROTTLE_LIMIT: '100000',
  EMAIL_VERIFICATION_REQUIRED: 'true',
  ADMIN_EMAIL: CORE_ADMIN_EMAIL,
  ADMIN_PASSWORD: CORE_ADMIN_PASSWORD,
  JOBS_KEY: CORE_JOBS_KEY,
  STORAGE_PROVIDER: 'local',
};

export interface SeedCoreDataOptions {
  adminEmail?: string;
  adminPassword?: string;
}

/** Reuses the Session 17 seed path: references → admin → full demo dataset. */
export async function seedCoreData(
  app: INestApplicationContext,
  options: SeedCoreDataOptions = {},
): Promise<void> {
  const email = options.adminEmail ?? CORE_ADMIN_EMAIL;
  const password = options.adminPassword ?? CORE_ADMIN_PASSWORD;
  const locations = app.get(
    getModelToken(LocationsCollection),
  ) as Model<LocationModel>;
  await seedLocations(locations);
  const categories = app.get(
    getModelToken(SkillCategoriesCollection),
  ) as Model<SkillCategoryModel>;
  const skills = app.get(getModelToken(SkillsCollection)) as Model<SkillModel>;
  await seedSkills(categories, skills);
  const adminOptions: SeedAdminOptions = { email, password, reset: false };
  await seedAdmin(app, adminOptions);
  const users = app.get(UsersService);
  const admin = await users.findByEmail(email.toLowerCase().trim());
  if (admin) {
    await users.setEmailVerified(admin._id.toString());
  }
  await seedDemo(app);
}
