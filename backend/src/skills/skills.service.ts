import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { createWithUniqueSlug, slugifyText } from '../common/slug/slugify.util';
import {
  CreateSkillCategoryDto,
  CreateSkillDto,
  SkillQueryDto,
  UpdateSkillCategoryDto,
  UpdateSkillDto,
} from './dto/skill.dto';
import {
  SkillCategoryModel,
  SkillCategoriesCollection,
} from './schemas/skill-category.schema';
import { SkillModel, SkillsCollection } from './schemas/skill.schema';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read + admin-maintenance service over `skill_categories` and `skills`
 * (inventory §2.4). Categories/skills are deactivated, never deleted.
 */
@Injectable()
export class SkillsService {
  constructor(
    @InjectModel(SkillCategoriesCollection)
    private readonly categoryModel: Model<SkillCategoryModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
  ) {}

  async findCategories(): Promise<SkillCategoryModel[]> {
    return this.categoryModel.find({ active: true }).sort({ order: 1 }).exec();
  }

  async findSkills(filters: SkillQueryDto): Promise<SkillModel[]> {
    const query: FilterQuery<SkillModel> = { active: true };
    if (filters.categoryId) {
      query.categoryId = filters.categoryId;
    }
    if (filters.q) {
      const pattern = escapeRegex(filters.q.trim());
      query.$or = [
        { nameFr: { $regex: pattern, $options: 'i' } },
        { nameAr: { $regex: pattern, $options: 'i' } },
      ];
    }
    return this.skillModel.find(query).sort({ order: 1, nameFr: 1 }).exec();
  }

  async createCategory(
    dto: CreateSkillCategoryDto,
  ): Promise<SkillCategoryModel> {
    const { doc } = await createWithUniqueSlug(
      (slug) => this.categoryModel.create({ ...dto, slug }),
      slugifyText(dto.nameFr),
    );
    return doc;
  }

  async updateCategory(
    id: string,
    dto: UpdateSkillCategoryDto,
  ): Promise<SkillCategoryModel> {
    const updated = await this.categoryModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException(
        'SKILL_CATEGORY_NOT_FOUND',
        'Skill category not found',
        404,
      );
    }
    return updated;
  }

  async createSkill(dto: CreateSkillDto): Promise<SkillModel> {
    const { doc } = await createWithUniqueSlug(
      (slug) =>
        this.skillModel.create({
          nameAr: dto.nameAr,
          nameFr: dto.nameFr,
          order: dto.order,
          categoryId: dto.categoryId,
          slug,
        }),
      slugifyText(dto.nameFr),
    );
    return doc;
  }

  async updateSkill(id: string, dto: UpdateSkillDto): Promise<SkillModel> {
    const updated = await this.skillModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException('SKILL_NOT_FOUND', 'Skill not found', 404);
    }
    return updated;
  }
}
