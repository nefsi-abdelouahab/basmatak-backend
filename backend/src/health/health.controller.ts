import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';

@ApiTags('core')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Service liveness check' })
  check() {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }
}
