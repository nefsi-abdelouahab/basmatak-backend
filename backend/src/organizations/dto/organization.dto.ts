import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALGERIAN_PHONE_PATTERN,
  normalizeAlgerianPhone,
} from '../../common/phone/algerian-phone';

export const MAX_ORG_TYPE_LENGTH = 80;
export const MAX_ORG_REGISTRATION_NUMBER_LENGTH = 80;
export const MAX_ORG_ADDRESS_LENGTH = 500;
export const MAX_ORG_WEBSITE_LENGTH = 500;
export const MIN_ORG_FOUNDED_YEAR = 1800;
export const MAX_ORG_FOCUS_DISCIPLINES = 12;
export const MAX_ORG_OPERATING_SCOPE_LENGTH = 120;

/** Canonical Algerian phone stored by the platform (`+213` + 9 digits). */
export const ORG_PHONE_PATTERN = ALGERIAN_PHONE_PATTERN;

export class OrganizationLocationDto {
  @ApiPropertyOptional({ description: 'Wilaya code (01-58)', example: '16' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  wilayaId?: string;

  @ApiPropertyOptional({
    description: 'Municipality code (4 digits)',
    example: '1601',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  municipalityId?: string;

  @ApiPropertyOptional({ maxLength: MAX_ORG_ADDRESS_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ORG_ADDRESS_LENGTH)
  address?: string;
}

export class OrganizationContactDto {
  @ApiPropertyOptional({ example: 'contact@example.org', maxLength: 254 })
  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description:
      'Optional Algerian phone. Accepts 0XXXXXXXXX, +213XXXXXXXXX, or 00213XXXXXXXXX and stores +213XXXXXXXXX',
    example: '+213555123456',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? (normalizeAlgerianPhone(value) ?? value)
      : value,
  )
  @Matches(ORG_PHONE_PATTERN, {
    message: 'phone must be a valid Algerian phone number',
  })
  phone?: string;
}

export class OrganizationPublicProfileDto {
  @ApiProperty({
    description: 'Neutral platform-profile toggle (default on)',
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;
}

/** Public location projection: exactly the three stored location facts. */
export class PublicOrganizationLocationDto {
  @ApiProperty({ nullable: true, example: '16' })
  wilayaId!: string | null;

  @ApiProperty({ nullable: true, example: '1601' })
  municipalityId!: string | null;

  @ApiProperty({ nullable: true, example: 'Rue Didouche Mourad' })
  address!: string | null;
}

/** Public contact projection (both fields optional in storage). */
export class PublicOrganizationContactDto {
  @ApiProperty({ nullable: true, example: 'contact@example.org' })
  email!: string | null;

  @ApiProperty({
    nullable: true,
    required: false,
    example: '+213555123456',
    description:
      'Present only for an eligible signed-in viewer with a dedicated organization contact phone.',
  })
  phone?: string;
}

export class PublicOrganizationAggregatesDto {
  @ApiProperty()
  volunteers!: number;

  @ApiProperty()
  initiativesActive!: number;

  @ApiProperty()
  initiativesCompleted!: number;

  @ApiProperty()
  verifiedHours!: number;

  @ApiProperty()
  responseRate!: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  perDomain!: Array<{ domain: string; share: number }>;

  @ApiProperty({ nullable: true, example: 2018 })
  activeSince!: number | null;
}

/**
 * Public organization card (`GET /organizations`). Deliberately narrow: no
 * owner, moderation, reliability, registration-number or audit fields.
 */
export class PublicOrganizationCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  nameAr!: string | null;

  @ApiProperty({ nullable: true })
  nameFr!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  logoMediaId!: string | null;

  @ApiProperty({ nullable: true })
  coverMediaId!: string | null;

  @ApiProperty({ nullable: true, example: 'ORG-000123' })
  registryId!: string | null;

  @ApiProperty({ enum: ['verified'] })
  verificationStatus!: 'verified';

  @ApiProperty({ nullable: true, example: 2018 })
  foundedYear!: number | null;
}

/** Public organization profile (`GET /organizations/:slug`). */
export class PublicOrganizationProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true, example: 'ORG-000123' })
  registryId!: string | null;

  @ApiProperty({ nullable: true })
  nameAr!: string | null;

  @ApiProperty({ nullable: true })
  nameFr!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  logoMediaId!: string | null;

  @ApiProperty({ nullable: true })
  coverMediaId!: string | null;

  @ApiProperty({ type: PublicOrganizationLocationDto })
  location!: PublicOrganizationLocationDto;

  @ApiProperty({ nullable: true, example: 'https://example.org' })
  website!: string | null;

  @ApiProperty({ nullable: true, example: 2018 })
  foundedYear!: number | null;

  @ApiProperty({ enum: ['verified'] })
  verificationStatus!: 'verified';

  @ApiProperty({ type: PublicOrganizationContactDto })
  contact!: PublicOrganizationContactDto;

  @ApiProperty({ type: 'array', items: { type: 'string' } })
  focusDisciplines!: string[];

  @ApiProperty({ nullable: true })
  operatingScope!: string | null;

  @ApiProperty({ type: PublicOrganizationAggregatesDto })
  aggregates!: PublicOrganizationAggregatesDto;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'جمعية الأمل', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'Association El-Amel', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string;

  @ApiPropertyOptional({
    example: 'Volunteer charity in Algiers',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Own media id',
  })
  @IsOptional()
  @IsMongoId()
  logoMediaId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Cover media id (purpose organization_cover)',
  })
  @IsOptional()
  @IsMongoId()
  coverMediaId?: string;

  @ApiPropertyOptional({
    description: 'Organization type (free-form short text)',
    example: 'Association',
    maxLength: MAX_ORG_TYPE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ORG_TYPE_LENGTH)
  type?: string;

  @ApiPropertyOptional({ maxLength: MAX_ORG_REGISTRATION_NUMBER_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ORG_REGISTRATION_NUMBER_LENGTH)
  registrationNumber?: string;

  @ApiPropertyOptional({ type: OrganizationLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationLocationDto)
  location?: OrganizationLocationDto;

  @ApiPropertyOptional({
    example: 'https://example.org',
    maxLength: MAX_ORG_WEBSITE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ORG_WEBSITE_LENGTH)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'website must be a valid http(s) URL' },
  )
  website?: string;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @IsInt()
  @Min(MIN_ORG_FOUNDED_YEAR)
  @Max(new Date().getFullYear())
  foundedYear?: number;

  @ApiPropertyOptional({ type: OrganizationContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationContactDto)
  contact?: OrganizationContactDto;

  @ApiPropertyOptional({
    description: 'Skill-category refs backing the focus-disciplines chips',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ORG_FOCUS_DISCIPLINES)
  @IsMongoId({ each: true })
  focusDisciplines?: string[];

  @ApiPropertyOptional({
    description: 'Operating scope (free-form short text)',
    example: 'Algiers and surroundings',
    maxLength: MAX_ORG_OPERATING_SCOPE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ORG_OPERATING_SCOPE_LENGTH)
  operatingScope?: string;

  @ApiPropertyOptional({ type: OrganizationPublicProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationPublicProfileDto)
  publicProfile?: OrganizationPublicProfileDto;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description:
      'Optional annual-report attachment (purpose organization_document, no workflow)',
  })
  @IsOptional()
  @IsMongoId()
  annualReportMediaId?: string;
}

export const ORG_OPPORTUNITY_STATUSES = [
  'published',
  'completed',
  'closed',
] as const;

export type OrgOpportunityStatus = (typeof ORG_OPPORTUNITY_STATUSES)[number];

export class OrgOpportunitiesQueryDto {
  @ApiPropertyOptional({
    description: 'Opportunity status filter (default published)',
    enum: ORG_OPPORTUNITY_STATUSES,
    default: 'published',
  })
  @IsOptional()
  @IsString()
  @IsIn([...ORG_OPPORTUNITY_STATUSES])
  status?: OrgOpportunityStatus;
}

export class OrganizationListQueryDto {
  @ApiPropertyOptional({
    description: 'Bounded public search (name/slug)',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Legacy roadmap `page` input — accepted but ignored; pagination stays cursor-based and `page` is returned as response metadata',
  })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}
export class SubmitOrganizationVerificationDto {
  @ApiProperty({
    description: 'Verification document media ids (at least one)',
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  documents!: string[];
}
