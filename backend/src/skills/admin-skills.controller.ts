import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';
import { SkillModel } from './schemas/skill.schema';
import { SkillsService } from './skills.service';

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

  @Patch(':id')
  @ApiOperation({ summary: 'Update a skill (active:false deactivates)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<SkillModel> {
    return this.skills.updateSkill(id, dto);
  }
}
