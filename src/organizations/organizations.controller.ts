import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Public } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  OrganizationListQueryDto,
  SubmitOrganizationVerificationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

/**
 * Organizations controller (inventory §2.7). `/me` routes MUST be declared
 * before `/:slug` or `me` is swallowed by the param route (route-order trap).
 */
@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List verified, active organizations' })
  list(@Query() query: OrganizationListQueryDto) {
    return this.organizations.listPublic(query);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: "Read the caller's own organization" })
  getOwn(@CurrentAccount() account: AccountToken) {
    return this.organizations.getOwn(account);
  }

  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: "Update the caller's own organization" })
  updateOwn(
    @CurrentAccount() account: AccountToken,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.updateOwn(account, dto);
  }

  @ApiBearerAuth()
  @Get('me/profile-completion')
  @ApiOperation({ summary: "Profile-completion checklist of the caller's org" })
  getProfileCompletion(@CurrentAccount() account: AccountToken) {
    return this.organizations.getProfileCompletion(account);
  }

  @ApiBearerAuth()
  @Delete('me')
  @ApiOperation({ summary: "Delete the caller's own organization account" })
  deleteOwn(@CurrentAccount() account: AccountToken) {
    return this.organizations.deleteOwn(account);
  }

  @ApiBearerAuth()
  @Post('me/verification')
  @ApiOperation({ summary: 'Submit (or resubmit) verification documents' })
  submitVerification(
    @CurrentAccount() account: AccountToken,
    @Body() dto: SubmitOrganizationVerificationDto,
  ) {
    return this.organizations.submitVerification(account, dto.documents);
  }

  @ApiBearerAuth()
  @Get('me/verification')
  @ApiOperation({
    summary: "Latest verification status of the caller's organization",
  })
  getVerificationStatus(@CurrentAccount() account: AccountToken) {
    return this.organizations.getVerificationStatus(account);
  }

  @ApiParam({
    name: 'slug',
    description: 'Organization slug',
    type: String,
  })
  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Public organization profile by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.organizations.getPublicBySlug(slug);
  }
}
