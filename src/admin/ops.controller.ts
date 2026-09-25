import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { MaintenanceService } from '../core/maintenance/maintenance.service';
import { MaintenanceToggleDto } from './dto/admin-part-b.dto';

@ApiBearerAuth()
@ApiTags('admin (ops)')
@Controller('admin/ops')
@Roles('admin')
export class AdminOpsController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post('maintenance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle runtime maintenance mode' })
  toggle(@Body() dto: MaintenanceToggleDto) {
    return this.maintenance.setState(dto.enabled, dto.message);
  }
}
