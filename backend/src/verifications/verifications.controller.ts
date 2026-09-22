import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { RejectDto, VerifyDto } from './dto/verification.dto';
import { VerificationsService } from './verifications.service';

/**
 * Verifications controller (inventory §2.13, roadmap S11 Part B): the owning
 * organization's verify/reject decisions and the read route for decisions.
 * Volunteer callers to verify/reject → 403 (RolesGuard); foreign orgs → 404
 * (service).
 */
@ApiTags('verifications')
@Controller()
export class VerificationsController {
  constructor(private readonly verifications: VerificationsService) {}

  @Post('submissions/:submissionId/verify')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Verify (approve) an owned submission' })
  verify(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
    @Body() dto: VerifyDto,
  ) {
    return this.verifications.verify(account, submissionId, dto);
  }

  @Post('submissions/:submissionId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Reject an owned submission with a reason' })
  reject(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
    @Body() dto: RejectDto,
  ) {
    return this.verifications.reject(account, submissionId, dto);
  }

  @Get('verifications/:verificationId')
  @ApiOperation({
    summary: 'Verification decision detail (own volunteer or owning org)',
  })
  get(
    @CurrentAccount() account: AccountToken,
    @Param('verificationId') verificationId: string,
  ) {
    return this.verifications.getVerification(account, verificationId);
  }
}
