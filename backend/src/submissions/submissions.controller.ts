import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  SubmissionListQueryDto,
  SubmitDto,
  UpdateSubmissionDto,
} from './dto/submission.dto';
import { SubmissionsService } from './submissions.service';

/**
 * Submissions controller (inventory §2.12, roadmap S10 Part A).
 */
@ApiTags('submissions')
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('participations/:participationId/submissions')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Create a draft submission for an owned participation',
  })
  create(
    @CurrentAccount() account: AccountToken,
    @Param('participationId') participationId: string,
  ) {
    return this.submissions.createForParticipation(account, participationId);
  }

  @Get('submissions/me')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's own submissions" })
  listMine(
    @CurrentAccount() account: AccountToken,
    @Query() query: SubmissionListQueryDto,
  ) {
    return this.submissions.listMine(account, query);
  }

  @Get('submissions/:submissionId')
  @ApiOperation({
    summary: 'Submission detail (own volunteer or owning organization)',
  })
  get(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissions.getDetail(account, submissionId);
  }

  @Patch('submissions/:submissionId')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Edit a draft (rejected returns to draft)' })
  update(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissions.updateDraft(account, submissionId, dto);
  }

  @Post('submissions/:submissionId/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Submit a draft (description, evidence, consent rules)',
  })
  submit(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
    @Body() dto: SubmitDto,
  ) {
    return this.submissions.submit(account, submissionId, dto);
  }

  @Get('organizations/me/submissions')
  @Roles('organization')
  @ApiOperation({ summary: 'Verification inbox of the caller organization' })
  listForOrganization(
    @CurrentAccount() account: AccountToken,
    @Query() query: SubmissionListQueryDto,
  ) {
    return this.submissions.listForOrganization(account, query);
  }

  @Post('submissions/:submissionId/start-review')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({
    summary: 'Move a submitted submission to under_review (owning org)',
  })
  startReview(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissions.startReview(account, submissionId);
  }
}
