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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  CreateSubmissionDto,
  SubmissionListQueryDto,
  SubmitDto,
  UpdateSubmissionDto,
} from './dto/submission.dto';
import { SubmissionsService } from './submissions.service';

/**
 * Submissions controller (inventory §2.12, roadmap S10 Part A).
 */
@ApiBearerAuth()
@ApiTags('submissions')
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @ApiParam({
    name: 'participationId',
    description: 'The participation id',
    type: String,
    format: 'ObjectId',
  })
  @Post('participations/:participationId/submissions')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Create a draft submission for an owned participation',
  })
  create(
    @CurrentAccount() account: AccountToken,
    @Param('participationId') participationId: string,
    @Body() dto?: CreateSubmissionDto,
  ) {
    return this.submissions.createForParticipation(
      account,
      participationId,
      dto?.title,
    );
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

  @ApiParam({
    name: 'submissionId',
    description: 'The submission id',
    type: String,
    format: 'ObjectId',
  })
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

  @ApiParam({
    name: 'submissionId',
    description: 'The submission id',
    type: String,
    format: 'ObjectId',
  })
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

  @ApiParam({
    name: 'submissionId',
    description: 'The submission id',
    type: String,
    format: 'ObjectId',
  })
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

  @ApiParam({
    name: 'submissionId',
    description: 'The submission id',
    type: String,
    format: 'ObjectId',
  })
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
