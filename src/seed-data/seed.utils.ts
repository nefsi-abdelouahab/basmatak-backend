import { Model, Types } from 'mongoose';
import { LocationModel } from '../locations/schemas/location.schema';
import { SkillCategoryModel } from '../skills/schemas/skill-category.schema';
import { SkillModel } from '../skills/schemas/skill.schema';
import { LOCATION_SEEDS } from './locations';
import { SKILL_CATEGORY_SEEDS, SKILL_SEEDS } from './skills';

export interface LocationsSeedCounts {
  wilayas: number;
  municipalities: number;
}

export interface SkillsSeedCounts {
  categories: number;
  skills: number;
}

/**
 * Idempotent location seed: `bulkWrite` upserts keyed by unique `code`.
 * Re-running updates rows in place, so counts stay stable.
 */
export async function seedLocations(
  model: Model<LocationModel>,
): Promise<LocationsSeedCounts> {
  await model.bulkWrite(
    LOCATION_SEEDS.map((location) => ({
      updateOne: {
        filter: { code: location.code },
        update: { $set: location },
        upsert: true,
      },
    })),
  );
  return {
    wilayas: await model.countDocuments({ type: 'wilaya' }),
    municipalities: await model.countDocuments({ type: 'municipality' }),
  };
}

/**
 * Idempotent skill-catalog seed: categories first (bulkWrite upserts keyed by
 * unique `slug`), then skills updated with the resolved `categoryId`.
 * `active` is set on insert only, so a deactivated entry stays deactivated
 * across re-seeds (deactivate-not-delete, design D4).
 */
export async function seedSkills(
  categoryModel: Model<SkillCategoryModel>,
  skillModel: Model<SkillModel>,
): Promise<SkillsSeedCounts> {
  await categoryModel.bulkWrite(
    SKILL_CATEGORY_SEEDS.map((category) => ({
      updateOne: {
        filter: { slug: category.slug },
        update: {
          $set: {
            nameAr: category.nameAr,
            nameFr: category.nameFr,
            order: category.order,
          },
          $setOnInsert: { active: true },
        },
        upsert: true,
      },
    })),
  );

  const categories = await categoryModel.find({}).select('slug').exec();
  const slugToId = new Map<string, Types.ObjectId>();
  for (const category of categories) {
    slugToId.set(category.slug, category._id);
  }

  await skillModel.bulkWrite(
    SKILL_SEEDS.map((skill) => {
      const categoryId = slugToId.get(skill.categorySlug);
      if (!categoryId) {
        throw new Error(
          `Seed data integrity: category "${skill.categorySlug}" not found for skill "${skill.slug}"`,
        );
      }
      return {
        updateOne: {
          filter: { slug: skill.slug },
          update: {
            $set: {
              nameAr: skill.nameAr,
              nameFr: skill.nameFr,
              order: skill.order,
              categoryId,
            },
            $setOnInsert: { active: true },
          },
          upsert: true,
        },
      };
    }),
  );

  return {
    categories: await categoryModel.countDocuments(),
    skills: await skillModel.countDocuments(),
  };
}
