import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  ParticipantsQueryDto,
  ParticipationListQueryDto,
  RemoveParticipationDto,
} from './dto/participation.dto';
import { ParticipationsService } from './participations.service';

/**
 * Participations controller (inventory §2.10, roadmap S7): "My Tasks".
 */
@ApiTags('participations')
@Controller()
export class ParticipationsController {
  constructor(private readonly participations: ParticipationsService) {}

  @Get('participations/me')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's own participations" })
  listOwn(
    @CurrentAccount() account: AccountToken,
    @Query() query: ParticipationListQueryDto,
  ) {
    return this.participations.listMyParticipations(account, query);
  }

  @Get('participations/:participationId')
  @ApiOperation({
    summary: 'Participation detail (own volunteer or owning org)',
  })
  get(
    @CurrentAccount() account: AccountToken,
    @Param('participationId') participationId: string,
  ) {
    return this.participations.getParticipation(account, participationId);
  }

  @Post('participations/:participationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Withdraw from a task (frees the seat, transaction)',
  })
  withdraw(
    @CurrentAccount() account: AccountToken,
    @Param('participationId') participationId: string,
  ) {
    return this.participations.withdrawParticipation(account, participationId);
  }

  @Post('participations/:participationId/remove')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({
    summary: 'Remove a participant with a reason (seat stays allocated)',
  })
  remove(
    @CurrentAccount() account: AccountToken,
    @Param('participationId') participationId: string,
    @Body() dto: RemoveParticipationDto,
  ) {
    return this.participations.removeParticipation(
      account,
      participationId,
      dto.reason,
    );
  }

  @Get('opportunities/:opportunityId/participants')
  @Roles('organization')
  @ApiOperation({ summary: 'List active participants of an owned opportunity' })
  listForOpportunity(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Query() query: ParticipantsQueryDto,
  ) {
    return this.participations.listParticipants(account, opportunityId, query);
  }
}
