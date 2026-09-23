import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { ExperiencesService } from './experiences.service';

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
  @ApiOperation({ summary: 'Public proof summary for a verification code' })
  proof(@Param('verificationCode') verificationCode: string) {
    return this.experiences.getPublicProof(verificationCode);
  }
}
