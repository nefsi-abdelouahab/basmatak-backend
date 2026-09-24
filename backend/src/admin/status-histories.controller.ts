import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CursorPage } from '../common/pagination/paginated.interface';
import { StatusHistoryModel } from '../core/status-transitions/status-histories.schema';
import { StatusHistoriesQueryDto } from './dto/admin-part-b.dto';
import { AdminStatusHistoriesService } from './status-histories.service';

@ApiBearerAuth()
@ApiTags('admin (status-histories)')
@Controller('admin/status-histories')
@Roles('admin')
export class AdminStatusHistoriesController {
  constructor(private readonly histories: AdminStatusHistoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Read status history for one entity' })
  list(
    @Query() query: StatusHistoriesQueryDto,
  ): Promise<CursorPage<StatusHistoryModel>> {
    return this.histories.list(query);
  }
}
