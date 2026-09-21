import { Controller, Get, Module } from '@nestjs/common';

/**
 * Test-only probe with a NON-public route so e2e tests can exercise the
 * EMAIL_VERIFICATION_REQUIRED gate guard on a real authenticated request.
 */
@Controller('probe')
class GateProbeController {
  @Get('gated')
  gated() {
    return { ok: true };
  }
}

@Module({
  controllers: [GateProbeController],
})
export class GateProbeModule {}
