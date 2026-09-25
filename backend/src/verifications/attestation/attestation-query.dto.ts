import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const ATTESTATION_LANGS = ['ar', 'en'] as const;

export type AttestationLang = (typeof ATTESTATION_LANGS)[number];

/**
 * Attestation download query (Session 18). `lang` selects the certificate
 * content language (default `en`, matching the platform UI convention).
 * Full Arabic-script fidelity (unicode TTF + reshaping/bidi) is a flagged
 * follow-up — recorded in tasks.md, not built here.
 */
export class AttestationQueryDto {
  @ApiPropertyOptional({
    enum: ATTESTATION_LANGS,
    default: 'en',
    description:
      'Certificate content language (default en; Arabic-script fidelity deferred)',
  })
  @IsOptional()
  @IsIn(ATTESTATION_LANGS)
  lang?: AttestationLang;
}
