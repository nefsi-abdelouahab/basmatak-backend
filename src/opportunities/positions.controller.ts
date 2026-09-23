import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CreatePositionDto, UpdatePositionDto } from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

/**
 * Positions subsystem (inventory §2.8): seat-rule CRUD on an owned
 * opportunity's embedded positions.
 */
@ApiBearerAuth()
@ApiTags('opportunity-positions')
@Controller('opportunities/:opportunityId/positions')
export class PositionsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Add a position to an owned opportunity' })
  add(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: CreatePositionDto,
  ) {
    return this.opportunities.addPosition(account, opportunityId, dto);
  }

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @ApiParam({
    name: 'positionId',
    description: 'The position id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':positionId')
  @Roles('organization')
  @ApiOperation({ summary: 'Edit a position (requiredCount >= filledCount)' })
  update(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Param('positionId') positionId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.opportunities.updatePosition(
      account,
      opportunityId,
      positionId,
      dto,
    );
  }

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @ApiParam({
    name: 'positionId',
    description: 'The position id',
    type: String,
    format: 'ObjectId',
  })
  @Delete(':positionId')
  @Roles('organization')
  @ApiOperation({ summary: 'Delete a position with no applications/seats' })
  remove(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Param('positionId') positionId: string,
  ) {
    return this.opportunities.deletePosition(
      account,
      opportunityId,
      positionId,
    );
  }
}
