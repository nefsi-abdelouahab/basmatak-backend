import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { setReferenceCacheHeader } from '../common/http/cache-header';
import { SettingsService } from '../core/settings/settings.service';
import { SkillsService } from './skills.service';

@ApiTags('skill-categories')
@Controller('skill-categories')
export class SkillCategoriesController {
  constructor(
    private readonly skills: SkillsService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active skill categories, ordered by order' })
  async list(@Res({ passthrough: true }) res: Response) {
    await setReferenceCacheHeader(res, this.settings);
    return this.skills.findCategories();
  }
}
