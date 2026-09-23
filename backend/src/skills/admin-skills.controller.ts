import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';
import { SkillModel } from './schemas/skill.schema';
import { SkillsService } from './skills.service';

@ApiBearerAuth()
@ApiTags('skills (admin)')
@Controller('admin/skills')
@Roles('admin')
export class AdminSkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a skill (slug generated server-side)' })
  create(@Body() dto: CreateSkillDto): Promise<SkillModel> {
    return this.skills.createSkill(dto);
  }

  @ApiParam({
    name: 'id',
    description: 'The skill id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':id')
  @ApiOperation({ summary: 'Update a skill (active:false deactivates)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<SkillModel> {
    return this.skills.updateSkill(id, dto);
  }
}
