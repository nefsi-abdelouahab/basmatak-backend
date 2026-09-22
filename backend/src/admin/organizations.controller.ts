import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import {
  OrganizationStatusDto,
  OrganizationsListQueryDto,
  OrganizationsVerificationsQueryDto,
  RejectionReasonDto,
} from './dto/admin-query.dto';
import {
  AdminOrganizationsService,
  AdminVerificationDecision,
} from './organizations.service';

/**
 * Admin organizations controller (inventory §2.20). The static `verifications`
 * listing MUST be declared before any `:organizationId` route (route-order
 * trap, same discipline as `organizations/me`).
 */
@ApiTags('admin (organizations)')
@Controller('admin/organizations')
@Roles('admin')
export class AdminOrganizationsController {
  constructor(private readonly organizations: AdminOrganizationsService) {}

  @Get('verifications')
  @ApiOperation({ summary: 'Moderator triage queue (default status=pending)' })
  verifications(
    @Query() query: OrganizationsVerificationsQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    return this.organizations.listVerifications(query);
  }

  @Get()
  @ApiOperation({ summary: 'List every organization' })
  list(
    @Query() query: OrganizationsListQueryDto,
  ): Promise<CursorPage<OrganizationModel>> {
    return this.organizations.list(query);
  }

  @Patch(':organizationId/status')
  @ApiOperation({ summary: 'Suspend or reinstate an organization account' })
  setStatus(
    @CurrentAccount() account: AccountToken,
    @Param('organizationId') organizationId: string,
    @Body() dto: OrganizationStatusDto,
  ): Promise<OrganizationModel> {
    return this.organizations.setStatus(account, organizationId, dto.status);
  }

  @Post(':organizationId/verification/approve')
  @ApiOperation({ summary: 'Approve the pending verification (F1 decision)' })
  approve(
    @CurrentAccount() account: AccountToken,
    @Param('organizationId') organizationId: string,
  ): Promise<AdminVerificationDecision> {
    return this.organizations.approve(account, organizationId);
  }

  @Post(':organizationId/verification/reject')
  @ApiOperation({ summary: 'Reject the pending verification with a reason' })
  reject(
    @CurrentAccount() account: AccountToken,
    @Param('organizationId') organizationId: string,
    @Body() dto: RejectionReasonDto,
  ): Promise<AdminVerificationDecision> {
    return this.organizations.reject(
      account,
      organizationId,
      dto.rejectionReason,
    );
  }
}
