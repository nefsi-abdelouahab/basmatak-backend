import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  LocationModel,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import {
  SkillCategoryModel,
  SkillCategoriesCollection,
} from '../skills/schemas/skill-category.schema';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import { seedLocations, seedSkills } from '../seed-data/seed.utils';
import { seedAdmin } from './seed-admin';
import { seedDemo } from './seed-demo';

type SeedTarget = 'locations' | 'skills' | 'admin' | 'demo' | 'all';

const TARGETS: readonly SeedTarget[] = [
  'locations',
  'skills',
  'admin',
  'demo',
  'all',
];

function parseTarget(argv: string[]): SeedTarget {
  const onlyIndex = argv.indexOf('--only');
  const value = onlyIndex >= 0 ? argv[onlyIndex + 1] : 'all';
  return TARGETS.includes(value as SeedTarget) ? (value as SeedTarget) : 'all';
}

async function run(): Promise<void> {
  const target = parseTarget(process.argv.slice(2));
  // Reuses the real AppModule wiring (models/config/validators, design D3).
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const results: string[] = [];
    if (target === 'locations' || target === 'all') {
      const model = app.get(
        getModelToken(LocationsCollection),
      ) as Model<LocationModel>;
      const counts = await seedLocations(model);
      results.push(
        `locations: ${counts.wilayas} wilayas, ${counts.municipalities} municipalities`,
      );
    }
    if (target === 'skills' || target === 'all') {
      const categories = app.get(
        getModelToken(SkillCategoriesCollection),
      ) as Model<SkillCategoryModel>;
      const skills = app.get(
        getModelToken(SkillsCollection),
      ) as Model<SkillModel>;
      const counts = await seedSkills(categories, skills);
      results.push(
        `skills: ${counts.categories} categories, ${counts.skills} skills`,
      );
    }
    if (target === 'admin' || target === 'all') {
      const result = await seedAdmin(app);
      results.push(`admin: ${result.action} ${result.email}`);
    }
    if (target === 'demo' || target === 'all') {
      const result = await seedDemo(app);
      results.push(
        `demo: org=${result.organizationEmail} verified=${result.organizationVerified}, volunteer=${result.volunteerEmail}`,
      );
    }
    console.log(`Seeded ${results.join(' | ')}`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
