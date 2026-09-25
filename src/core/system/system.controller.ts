import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { MaintenanceService } from '../maintenance/maintenance.service';

@ApiTags('core')
@Controller('system')
export class SystemController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Public system status with maintenance flag' })
  async status() {
    const state = await this.maintenance.getState();
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
      uptimeSeconds: Math.floor(process.uptime()),
      maintenance: state.enabled,
      message: state.message,
    };
  }
}
