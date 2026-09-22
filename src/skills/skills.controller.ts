import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { setReferenceCacheHeader } from '../common/http/cache-header';
import { SettingsService } from '../core/settings/settings.service';
import { SkillQueryDto } from './dto/skill.dto';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active skills, filter by category or text' })
  async list(
    @Query() query: SkillQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await setReferenceCacheHeader(res, this.settings);
    return this.skills.findSkills(query);
  }
}
