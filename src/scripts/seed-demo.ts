import * as bcrypt from 'bcrypt';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminOrganizationsService } from '../admin/organizations.service';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { MediaCollection, MediaModel } from '../media/schemas/media.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import { UsersService } from '../users/users.service';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../volunteers/schemas/volunteer-skill.schema';
import { VolunteerRegistrationExtrasService } from '../volunteers/volunteer-registration-extras.service';
import { VolunteersService } from '../volunteers/volunteers.service';
import { AppModule } from '../app.module';
import { adminSeedEnv, upsertAdmin } from './seed-admin';

/**
 * Demo bootstrap (Session 17, task 3.2): one verified demo organization and
 * one demo volunteer, idempotent by stable emails. The organization is driven
 * through the REAL write path: an `organizations` row (via the S5 registration
 * extras service) → a genuine pending `organization_verifications` row (via
 * `OrganizationsService.submitVerification`, which requires email-verified +
 * owned `verification_document` media) → `AdminOrganizationsService.approve`
 * (S15). No orphan field writes: `verificationStatus=verified` only ever comes
 * from the approve transition.
 */

const DEFAULT_ORG_EMAIL = 'demo-org@basmatak.test';
const DEFAULT_ORG_PASSWORD = 'DemoOrg123!';
const DEFAULT_VOLUNTEER_EMAIL = 'demo-volunteer@basmatak.test';
const DEFAULT_VOLUNTEER_PASSWORD = 'DemoVol123!';

const DEMO_SKILL_SLUGS = [
  'secourisme-de-base',
  'soutien-scolaire-en-mathematiques',
  'garde-denfants',
] as const;

export interface SeedDemoResult {
  organizationEmail: string;
  organizationVerified: boolean;
  volunteerEmail: string;
  volunteerSkills: number;
}

function demoSeedEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    orgEmail: env.DEMO_ORG_EMAIL ?? DEFAULT_ORG_EMAIL,
    orgPassword: env.DEMO_ORG_PASSWORD ?? DEFAULT_ORG_PASSWORD,
    volunteerEmail: env.DEMO_VOLUNTEER_EMAIL ?? DEFAULT_VOLUNTEER_EMAIL,
    volunteerPassword:
      env.DEMO_VOLUNTEER_PASSWORD ?? DEFAULT_VOLUNTEER_PASSWORD,
  };
}

function makeAccount(id: string, role: AccountToken['role']): AccountToken {
  return { sub: id, role, sessionId: new Types.ObjectId().toString() };
}

export async function seedDemo(
  app: INestApplicationContext,
): Promise<SeedDemoResult> {
  const env = demoSeedEnv();
  const users = app.get(UsersService);
  const organizations = app.get(OrganizationsService);
  const adminOrganizations = app.get(AdminOrganizationsService);
  const organizationExtras = app.get(OrganizationRegistrationExtrasService);
  const volunteerExtras = app.get(VolunteerRegistrationExtrasService);
  const volunteers = app.get(VolunteersService);

  const organizationModel = app.get(
    getModelToken(OrganizationsCollection),
  ) as Model<OrganizationModel>;
  const verificationModel = app.get(
    getModelToken(OrganizationVerificationsCollection),
  ) as Model<OrganizationVerificationModel>;
  const mediaModel = app.get(
    getModelToken(MediaCollection),
  ) as Model<MediaModel>;
  const skillModel = app.get(
    getModelToken(SkillsCollection),
  ) as Model<SkillModel>;
  const profileModel = app.get(
    getModelToken(VolunteerProfilesCollection),
  ) as Model<VolunteerProfileModel>;
  const volunteerSkillModel = app.get(
    getModelToken(VolunteerSkillsCollection),
  ) as Model<VolunteerSkillModel>;

  // Seed one demo organization, verifying it through the S15 approve path.
  const orgEmail = env.orgEmail.toLowerCase().trim();
  let orgUser = await users.findByEmail(orgEmail);
  if (!orgUser) {
    orgUser = await users.create({
      email: orgEmail,
      passwordHash: await bcrypt.hash(env.orgPassword, 10),
      role: 'organization',
    });
  }
  await users.setEmailVerified(orgUser._id.toString());

  let organization = await organizationModel
    .findOne({ userId: orgUser._id })
    .exec();
  if (!organization) {
    await organizationExtras.createExtras(
      { id: orgUser._id.toString(), role: 'organization' },
      { email: orgEmail },
    );
    organization = await organizationModel
      .findOne({ userId: orgUser._id })
      .exec();
  }

  if (organization && organization.verificationStatus !== 'verified') {
    const pending = await verificationModel
      .findOne({ organizationId: organization._id, status: 'pending' })
      .exec();
    if (!pending) {
      let document = await mediaModel
        .findOne({
          ownerId: orgUser._id,
          purpose: 'verification_document',
        })
        .exec();
      if (!document) {
        document = await mediaModel.create({
          ownerId: orgUser._id,
          purpose: 'verification_document',
          visibility: 'private',
          type: 'file',
          storageKey: `verification_document/demo/${orgUser._id.toString()}/id.pdf`,
          filename: 'demo-verification.pdf',
          mimeType: 'application/pdf',
        });
      }
      await organizations.submitVerification(
        makeAccount(orgUser._id.toString(), 'organization'),
        [document._id.toString()],
      );
    }

    const adminUser = await ensureAdmin(users);
    await adminOrganizations.approve(
      makeAccount(adminUser._id.toString(), 'admin'),
      organization._id.toString(),
    );
    organization = await organizationModel.findById(organization._id).exec();
  }

  // Seed one demo volunteer with a profile and catalog skills.
  const volunteerEmail = env.volunteerEmail.toLowerCase().trim();
  let volunteerUser = await users.findByEmail(volunteerEmail);
  if (!volunteerUser) {
    volunteerUser = await users.create({
      email: volunteerEmail,
      passwordHash: await bcrypt.hash(env.volunteerPassword, 10),
      role: 'volunteer',
    });
  }
  const existingProfile = await profileModel
    .findOne({ userId: volunteerUser._id })
    .exec();
  if (!existingProfile) {
    await volunteerExtras.createExtras(
      { id: volunteerUser._id.toString(), role: 'volunteer' },
      { email: volunteerEmail },
    );
  }

  const catalog = await skillModel
    .find({ slug: { $in: [...DEMO_SKILL_SLUGS] } })
    .exec();
  let volunteerSkills = 0;
  for (const catalogSkill of catalog) {
    const exists = await volunteerSkillModel
      .exists({
        volunteerId: volunteerUser._id,
        skillId: catalogSkill._id,
      })
      .exec();
    if (!exists) {
      await volunteers.addSkill(volunteerUser._id.toString(), {
        skillId: catalogSkill._id.toString(),
        level: 3,
        yearsOfExperience: 1,
        isPrimary: catalogSkill.slug === 'secourisme-de-base',
      });
    }
    volunteerSkills += 1;
  }

  return {
    organizationEmail: orgEmail,
    organizationVerified: organization?.verificationStatus === 'verified',
    volunteerEmail,
    volunteerSkills,
  };
}

async function ensureAdmin(users: UsersService) {
  const options = adminSeedEnv();
  const admin = await users.findByEmail(options.email);
  if (admin) {
    return admin;
  }
  await upsertAdmin(users, options);
  const created = await users.findByEmail(options.email);
  if (!created) {
    throw new Error('Admin upsert did not create the expected admin account');
  }
  return created;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await seedDemo(app);
    console.log(
      `Demo seed: org=${result.organizationEmail} verified=${result.organizationVerified} | volunteer=${result.volunteerEmail} skills=${result.volunteerSkills}`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exit(1);
  });
}
