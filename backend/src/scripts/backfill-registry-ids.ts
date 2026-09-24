import { Model, Types } from 'mongoose';
import { RegistryCounterType } from '../common/counters/counters.schema';
import { RegistryIdService } from '../common/counters/registry-id.service';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';

export interface BackfillModels {
  volunteer: Model<VolunteerProfileModel>;
  organization: Model<OrganizationModel>;
  opportunity: Model<OpportunityModel>;
  experience: Model<VolunteerExperienceModel>;
}

export interface BackfillResult {
  volunteer: number;
  organization: number;
  opportunity: number;
  experience: number;
}

const BACKFILL_TARGETS: ReadonlyArray<{
  type: RegistryCounterType;
  modelKey: keyof BackfillModels;
}> = [
  { type: 'volunteer', modelKey: 'volunteer' },
  { type: 'organization', modelKey: 'organization' },
  { type: 'opportunity', modelKey: 'opportunity' },
  { type: 'experience', modelKey: 'experience' },
];

interface BackfillRow {
  _id: Types.ObjectId;
}

/**
 * Backfill seam (roadmap registry-ids): assigns a minted registry id to every
 * row that predates the feature (`registryId` missing), one mint per row, and
 * never touches rows that already carry a value — safe to run twice (the
 * second run reports 0). Mints are not transactional here by design: the
 * mission is coverage for legacy rows, not the atomic session minting used by
 * runtime create paths.
 */
async function fillMissing(
  registryId: RegistryIdService,
  model: Model<BackfillRow>,
  type: RegistryCounterType,
): Promise<number> {
  let updated = 0;
  const cursor = model
    .find({ registryId: { $exists: false } })
    .select('_id')
    .cursor();
  for await (const row of cursor) {
    const id = await registryId.getNext(type);
    await model.updateOne({ _id: row._id }, { $set: { registryId: id } });
    updated += 1;
  }
  return updated;
}

export async function backfillRegistryIds(
  registryId: RegistryIdService,
  models: BackfillModels,
): Promise<BackfillResult> {
  const counts: BackfillResult = {
    volunteer: 0,
    organization: 0,
    opportunity: 0,
    experience: 0,
  };
  for (const target of BACKFILL_TARGETS) {
    counts[target.type] = await fillMissing(
      registryId,
      models[target.modelKey] as Model<BackfillRow>,
      target.type,
    );
  }
  return counts;
}

async function run(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { getModelToken } = await import('@nestjs/mongoose');
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const registryId = app.get(RegistryIdService);
    const counts = await backfillRegistryIds(registryId, {
      volunteer: app.get(
        getModelToken(VolunteerProfilesCollection),
      ) as Model<VolunteerProfileModel>,
      organization: app.get(
        getModelToken(OrganizationsCollection),
      ) as Model<OrganizationModel>,
      opportunity: app.get(
        getModelToken(OpportunitiesCollection),
      ) as Model<OpportunityModel>,
      experience: app.get(
        getModelToken(VolunteerExperiencesCollection),
      ) as Model<VolunteerExperienceModel>,
    });
    console.log(
      `backfill-registry-ids: volunteer=${counts.volunteer}, organization=${counts.organization}, opportunity=${counts.opportunity}, experience=${counts.experience}`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
}
