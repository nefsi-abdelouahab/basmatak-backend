import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CursorPage } from '../common/pagination/paginated.interface';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { OrganizationVerificationModel } from '../organizations/schemas/organization-verification.schema';
import {
  AssignAdminDto,
  OrganizationStatusDto,
  OrganizationsListQueryDto,
  OrganizationsVerificationsQueryDto,
  RejectionReasonDto,
} from './dto/admin-query.dto';
import {
  AdminOrganizationsService,
  AdminVerificationDecision,
} from './organizations.service';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

/**
 * Admin organizations controller (inventory §2.20). The static `verifications`
 * listing MUST be declared before any `:organizationId` route (route-order
 * trap, same discipline as `organizations/me`).
 */
@ApiBearerAuth()
@ApiTags('admin (organizations)')
@Controller('admin/organizations')
@Roles('admin')
export class AdminOrganizationsController {
  constructor(private readonly organizations: AdminOrganizationsService) {}

  @Get('verifications')
  @ApiOperation({ summary: 'Moderator triage queue (default status=pending)' })
  async verifications(
    @Query() query: OrganizationsVerificationsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<Record<string, unknown>> | StreamableFile> {
    const page = await this.organizations.listVerifications(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('verifications')}"`,
      );
      return new StreamableFile(adminCsvStream('verifications', page.items));
    }
    return page;
  }

  @Get()
  @ApiOperation({ summary: 'List every organization' })
  async list(
    @Query() query: OrganizationsListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<OrganizationModel> | StreamableFile> {
    const page = await this.organizations.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('organizations')}"`,
      );
      return new StreamableFile(adminCsvStream('organizations', page.items));
    }
    return page;
  }

  @ApiParam({
    name: 'organizationId',
    description: 'The organization id',
    type: String,
    format: 'ObjectId',
  })
  @Get(':organizationId/verification/latest')
  @ApiOperation({ summary: 'Newest verification dossier for one organization' })
  latestVerification(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationVerificationModel> {
    return this.organizations.latestVerification(organizationId);
  }

  @ApiParam({
    name: 'rowId',
    description: 'The organization_verifications row id',
    type: String,
    format: 'ObjectId',
  })
  @Patch('verifications/:rowId/assign')
  @ApiOperation({ summary: 'Assign a verification dossier to an admin' })
  assignVerification(
    @Param('rowId') rowId: string,
    @Body() dto: AssignAdminDto,
  ): Promise<OrganizationVerificationModel> {
    return this.organizations.assignVerification(rowId, dto.assignedAdminId);
  }

  @ApiParam({
    name: 'organizationId',
    description: 'The organization id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':organizationId/status')
  @ApiOperation({ summary: 'Suspend or reinstate an organization account' })
  setStatus(
    @CurrentAccount() account: AccountToken,
    @Param('organizationId') organizationId: string,
    @Body() dto: OrganizationStatusDto,
  ): Promise<OrganizationModel> {
    return this.organizations.setStatus(account, organizationId, dto.status, {
      reason: dto.reason,
      notes: dto.notes,
    });
  }

  @ApiParam({
    name: 'organizationId',
    description: 'The organization id',
    type: String,
    format: 'ObjectId',
  })
  @Post(':organizationId/verification/approve')
  @ApiOperation({ summary: 'Approve the pending verification (F1 decision)' })
  approve(
    @CurrentAccount() account: AccountToken,
    @Param('organizationId') organizationId: string,
  ): Promise<AdminVerificationDecision> {
    return this.organizations.approve(account, organizationId);
  }

  @ApiParam({
    name: 'organizationId',
    description: 'The organization id',
    type: String,
    format: 'ObjectId',
  })
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
