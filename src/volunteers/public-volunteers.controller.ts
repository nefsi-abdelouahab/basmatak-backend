import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Public } from '../common/decorators/auth.decorators';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PublicExperiencesQueryDto, TalentsQueryDto } from './dto/talents.dto';
import { VolunteersService } from './volunteers.service';

/**
 * Guest-visible volunteer surface (inventory §2.6, roadmap S12). `@Controller()`
 * with no prefix mirrors `PublicVerificationController`. It is registered AFTER
 * `VolunteersController` in VolunteersModule so the static `/volunteers/me[...]`
 * routes win over the `:username` catch-all (D1 ordering).
 */
@ApiTags('volunteers-public')
@Controller()
export class PublicVolunteersController {
  constructor(private readonly volunteers: VolunteersService) {}

  @Get('talents')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Talents feed (enabled profiles, filters, cursor)' })
  talents(
    @Query() query: TalentsQueryDto,
    @CurrentAccount() account?: AccountToken,
  ) {
    // Session 19: optional caller threads through for per-viewer `isFavorited`
    // (guests unchanged).
    return this.volunteers.listPublicTalents(query, account?.sub);
  }

  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Get('volunteers/:username')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Public volunteer profile by username (A5 gating)' })
  async publicProfile(
    @Param('username') username: string,
    @CurrentAccount() account?: AccountToken,
  ) {
    // Session 19: optional caller threads through for per-viewer `isFavorited`
    // (guests unchanged).
    const profile = await this.volunteers.getPublicProfile(
      username,
      account?.sub,
    );
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return profile;
  }

  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Get('volunteers/:username/experiences')
  @Public()
  @ApiOperation({
    summary: 'Public experiences of a volunteer (public rows only)',
  })
  async publicExperiences(
    @Param('username') username: string,
    @Query() query: PublicExperiencesQueryDto,
  ) {
    const profile =
      await this.volunteers.findEnabledProfileByUsername(username);
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return this.volunteers.getPublicExperiences(
      profile.userId.toString(),
      query.limit,
      query.cursor,
    );
  }

  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Get('volunteers/:username/portfolio')
  @Public()
  @ApiOperation({
    summary: 'Public portfolio of a volunteer (public rows only)',
  })
  async publicPortfolio(@Param('username') username: string) {
    const profile =
      await this.volunteers.findEnabledProfileByUsername(username);
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return this.volunteers.getPublicPortfolio(username);
  }
}
