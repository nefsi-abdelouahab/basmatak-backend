import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('core')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service liveness check' })
  check() {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }
}
