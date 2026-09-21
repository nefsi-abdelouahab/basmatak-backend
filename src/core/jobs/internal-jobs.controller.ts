import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JobsKeyGuard } from './jobs-key.guard';

/**
 * Internal jobs endpoint (inventory §2.21). Reached at
 * `POST /api/v1/internal/jobs/run` (global prefix `api/v1`). Called by the
 * free external scheduler; also doubles as a warm-up for the sleeping host.
 */
@ApiTags('internal')
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JobsKeyGuard)
  @ApiOperation({
    summary: 'Run the registered job handlers (idempotent tick)',
  })
  run() {
    return this.jobsService.run();
  }
}
