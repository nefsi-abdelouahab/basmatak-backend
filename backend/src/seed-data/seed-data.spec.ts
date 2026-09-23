import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  LocationModel,
  LocationsCollection,
  LocationSchema,
} from '../locations/schemas/location.schema';
import {
  SkillCategoryModel,
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import {
  SkillModel,
  SkillsCollection,
  SkillSchema,
} from '../skills/schemas/skill.schema';
import { MUNICIPALITY_SEEDS, WILAYA_SEEDS } from './locations';
import { SKILL_CATEGORY_SEEDS, SKILL_SEEDS } from './skills';
import { seedLocations, seedSkills, pruneSkillCatalog } from './seed.utils';

describe('reference-data seeds (idempotent)', () => {
  let handle: MemoryConnectionHandle;
  let locationModel: ReturnType<typeof makeLocationModel>;
  let categoryModel: ReturnType<typeof makeCategoryModel>;
  let skillModel: ReturnType<typeof makeSkillModel>;

  function makeLocationModel() {
    return handle.connection.model<LocationModel>(
      LocationsCollection,
      LocationSchema,
    );
  }

  function makeCategoryModel() {
    return handle.connection.model<SkillCategoryModel>(
      SkillCategoriesCollection,
      SkillCategorySchema,
    );
  }

  function makeSkillModel() {
    return handle.connection.model<SkillModel>(SkillsCollection, SkillSchema);
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    locationModel = makeLocationModel();
    categoryModel = makeCategoryModel();
    skillModel = makeSkillModel();
  });

  afterEach(async () => {
    await Promise.all([
      handle.connection.collection(LocationsCollection).deleteMany({}),
      handle.connection.collection(SkillCategoriesCollection).deleteMany({}),
      handle.connection.collection(SkillsCollection).deleteMany({}),
    ]);
  });

  it('seedLocations plants every wilaya and municipality, idempotent on double-run', async () => {
    const first = await seedLocations(locationModel);
    expect(first.wilayas).toBe(WILAYA_SEEDS.length);
    expect(first.wilayas).toBe(58);
    expect(first.municipalities).toBe(MUNICIPALITY_SEEDS.length);
    expect(first.municipalities).toBe(1541);

    const second = await seedLocations(locationModel);
    expect(second).toEqual(first);
    const total = await locationModel.countDocuments();
    expect(total).toBe(WILAYA_SEEDS.length + MUNICIPALITY_SEEDS.length);
  });

  it('seedSkills plants the confirmed catalog, idempotent on double-run', async () => {
    const first = await seedSkills(categoryModel, skillModel);
    expect(first.categories).toBe(SKILL_CATEGORY_SEEDS.length);
    expect(first.categories).toBe(7);
    expect(first.skills).toBe(SKILL_SEEDS.length);
    expect(first.skills).toBeGreaterThanOrEqual(7 * 3);

    const second = await seedSkills(categoryModel, skillModel);
    expect(second).toEqual(first);

    const skills = await skillModel.find({}).exec();
    const perCategory = new Map<string, number>();
    for (const skill of skills) {
      const key = skill.categoryId.toString();
      perCategory.set(key, (perCategory.get(key) ?? 0) + 1);
    }
    for (const count of perCategory.values()) {
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it('seedSkills re-seeding does not reactivate deactivated entries', async () => {
    await seedSkills(categoryModel, skillModel);
    const firstCategory = await categoryModel.findOne({}).exec();
    expect(firstCategory).not.toBeNull();
    await categoryModel
      .updateOne({ _id: firstCategory!._id }, { $set: { active: false } })
      .exec();

    await seedSkills(categoryModel, skillModel);
    const after = await categoryModel.findById(firstCategory!._id).exec();
    expect(after?.active).toBe(false);
  });

  it('pruneSkillCatalog removes legacy rows and converges on the catalog', async () => {
    await seedSkills(categoryModel, skillModel);
    await categoryModel.create({
      slug: 'legacy-category',
      nameAr: 'قديم',
      nameFr: 'Ancien',
      order: 90,
      active: true,
    });
    const legacyCategory = await categoryModel
      .findOne({ slug: 'legacy-category' })
      .exec();
    await skillModel.create({
      slug: 'legacy-skill',
      categoryId: legacyCategory!._id,
      nameAr: 'مهارة قديمة',
      nameFr: 'Compétence ancienne',
      order: 90,
      active: true,
    });

    const pruned = await pruneSkillCatalog(categoryModel, skillModel);
    expect(pruned.categories).toBe(1);
    expect(pruned.skills).toBe(1);

    const categories = await categoryModel
      .find({})
      .select('slug')
      .lean()
      .exec();
    expect(categories.map((c: { slug: string }) => c.slug).sort()).toEqual(
      SKILL_CATEGORY_SEEDS.map((c) => c.slug).sort(),
    );
    const skills = await skillModel.find({}).select('slug').lean().exec();
    expect(skills.map((s: { slug: string }) => s.slug).sort()).toEqual(
      SKILL_SEEDS.map((s) => s.slug).sort(),
    );
  });

  it('pruneSkillCatalog is a no-op on an empty database', async () => {
    const pruned = await pruneSkillCatalog(categoryModel, skillModel);
    expect(pruned.categories).toBe(0);
    expect(pruned.skills).toBe(0);
  });
});
