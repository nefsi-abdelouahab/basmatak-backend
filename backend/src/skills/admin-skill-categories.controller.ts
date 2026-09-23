import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import {
  CreateSkillCategoryDto,
  UpdateSkillCategoryDto,
} from './dto/skill.dto';
import { SkillCategoryModel } from './schemas/skill-category.schema';
import { SkillsService } from './skills.service';

@ApiBearerAuth()
@ApiTags('skill-categories (admin)')
@Controller('admin/skill-categories')
@Roles('admin')
export class AdminSkillCategoriesController {
  constructor(private readonly skills: SkillsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a skill category (slug generated server-side)',
  })
  create(@Body() dto: CreateSkillCategoryDto): Promise<SkillCategoryModel> {
    return this.skills.createCategory(dto);
  }

  @ApiParam({
    name: 'id',
    description: 'The skill category id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a skill category (active:false deactivates)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSkillCategoryDto,
  ): Promise<SkillCategoryModel> {
    return this.skills.updateCategory(id, dto);
  }
}
