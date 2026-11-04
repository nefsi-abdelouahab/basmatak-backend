import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { ExperiencesService } from './experiences.service';

/** 20 proof lookups per minute (public route, code-guessing hardening). */
const VERIFY_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/**
 * Public verification proof (inventory §2.14, roadmap S11 Part B / A6):
 * possession-based guest route `GET /verify/:verificationCode`. `@Public`
 * skips JWT auth; guards pass public routes through.
 */
@ApiTags('verifications-public')
@Controller()
export class PublicVerificationController {
  constructor(private readonly experiences: ExperiencesService) {}

  @ApiParam({
    name: 'verificationCode',
    description: 'Verification code from the experience completion email',
    type: String,
  })
  @Get('verify/:verificationCode')
  @Public()
  @Throttle(VERIFY_LIMIT)
  @ApiOperation({ summary: 'Public proof summary for a verification code' })
  proof(@Param('verificationCode') verificationCode: string) {
    return this.experiences.getPublicProof(verificationCode);
  }
}
