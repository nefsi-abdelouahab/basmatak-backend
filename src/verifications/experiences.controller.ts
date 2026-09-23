import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  ExperienceListQueryDto,
  UpdateExperienceVisibilityDto,
} from './dto/verification.dto';
import { ExperiencesService } from './experiences.service';

/**
 * Experiences controller (inventory §2.14, roadmap S11 Part B): the owning
 * volunteer's own list/detail/visibility routes. Non-owners (including org
 * callers) read as not-found (404, service-selected).
 */
@ApiBearerAuth()
@ApiTags('experiences')
@Controller()
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

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
