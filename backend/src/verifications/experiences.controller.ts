import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  ExperienceListQueryDto,
  OrgExperienceListQueryDto,
  UpdateExperienceVisibilityDto,
} from './dto/verification.dto';
import { ExperiencesService } from './experiences.service';

/**
 * Experiences controller (inventory §2.14, roadmap S11 Part B + Session 15):
 * the owning volunteer's own list/detail/visibility routes plus the org
 * experiences list. Non-owners (including org callers on volunteer routes)
 * read as not-found (404, service-selected). The static
 * `organizations/me/experiences` route cannot collide with the
 * `organizations/:slug` param route (single-segment match only).
 */
@ApiBearerAuth()
@ApiTags('experiences')
@Controller()
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get('organizations/me/experiences')
  @Roles('organization')
  @ApiOperation({
    summary:
      "List verified experiences minted from the caller's own opportunities",
  })
  async listForOrganization(
    @CurrentAccount() account: AccountToken,
    @Query() query: OrgExperienceListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'csv') {
      const csv = await this.experiences.exportOrganizationCsv(account, query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="org-experiences.csv"',
      );
      return new StreamableFile(csv);
    }
    return this.experiences.listForOrganization(account, query);
  }

  @Get('experiences/me')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's own experiences" })
  listMine(
    @CurrentAccount() account: AccountToken,
    @Query() query: ExperienceListQueryDto,
  ) {
    return this.experiences.listMine(account, query);
  }

  @ApiParam({
    name: 'experienceId',
    description: 'The experience id',
    type: String,
    format: 'ObjectId',
  })
  @Get('experiences/:experienceId')
  @ApiOperation({
    summary: 'Experience detail (owning volunteer only)',
  })
  get(
    @CurrentAccount() account: AccountToken,
    @Param('experienceId') experienceId: string,
  ) {
    return this.experiences.getDetail(account, experienceId);
  }

  @ApiParam({
    name: 'experienceId',
    description: 'The experience id',
    type: String,
    format: 'ObjectId',
  })
  @Patch('experiences/:experienceId/visibility')
  @ApiOperation({ summary: 'Toggle public/private visibility (own row)' })
  updateVisibility(
    @CurrentAccount() account: AccountToken,
    @Param('experienceId') experienceId: string,
    @Body() dto: UpdateExperienceVisibilityDto,
  ) {
    return this.experiences.updateVisibility(account, experienceId, dto);
  }
}
