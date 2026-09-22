import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminSkillCategoriesController } from './admin-skill-categories.controller';
import { AdminSkillsController } from './admin-skills.controller';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from './schemas/skill-category.schema';
import { SkillSchema, SkillsCollection } from './schemas/skill.schema';
import { SkillCategoriesController } from './skill-categories.controller';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

/**
 * Skills feature module (inventory §2.4): public category/skill reads and admin
 * maintenance with deactivate-not-delete semantics. `MongooseModule` is
 * exported so the seed dispatcher can resolve the model tokens.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SkillCategoriesCollection, schema: SkillCategorySchema },
      { name: SkillsCollection, schema: SkillSchema },
    ]),
  ],
  controllers: [
    SkillsController,
    SkillCategoriesController,
    AdminSkillsController,
    AdminSkillCategoriesController,
  ],
  providers: [SkillsService],
  exports: [MongooseModule, SkillsService],
})
export class SkillsModule {}
