import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shared admin-list params (Session 10 `backend-v2-admin-lists`): every admin
 * list accepts whitelisted `sort`, a `pageSize` alias of `limit`, and
 * `format=json|csv`. Request paging stays cursor-based (Session 7 shape).
 */
export const ADMIN_SORT_NEWEST = 'newest';
export const ADMIN_SORT_OLDEST = 'oldest';

export class UsersQueryDto {
  @ApiPropertyOptional({ enum: ['volunteer', 'organization', 'admin'] })
  @IsOptional()
  @IsIn(['volunteer', 'organization', 'admin'])
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: string;

  @ApiPropertyOptional({ description: 'Email/name keyword', maxLength: 254 })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Alias of limit (default 20, max 50)',
  })
  @IsOptional()
  @IsString()
  pageSize?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;
}

export class UserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';

  @ApiPropertyOptional({
    description: 'Short reason recorded in status_histories',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Longer context recorded in status_histories',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class VolunteersQueryDto {
  @ApiPropertyOptional({
    description: 'Username/name/email keyword',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ description: 'Wilaya code filter' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  wilayaId?: string;

  @ApiPropertyOptional({ description: 'Municipality code filter' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  municipalityId?: string;

  @ApiPropertyOptional({ description: 'Skill id(s), comma-separated' })
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiPropertyOptional({ description: 'Created-at window start (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created-at window end (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'name'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'name'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class OrganizationsListQueryDto {
  @ApiPropertyOptional({
    description: 'Name/slug/registryId keyword',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ description: 'Organization type filter' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @ApiPropertyOptional({ description: 'Wilaya code filter' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  wilayaId?: string;

  @ApiPropertyOptional({ description: 'Municipality code filter' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  municipalityId?: string;

  @ApiPropertyOptional({ enum: ['pending', 'verified', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  verificationStatus?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'name'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'name'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class OrganizationsVerificationsQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'verified', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  status?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Assigned admin filter',
  })
  @IsOptional()
  @IsMongoId()
  assignedAdminId?: string;

  @ApiPropertyOptional({
    enum: ['oldest', 'newest'],
    default: 'oldest',
    description: 'FIFO triage order (oldest first by submittedAt)',
  })
  @IsOptional()
  @IsIn(['oldest', 'newest'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class OrganizationStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';

  @ApiPropertyOptional({
    description: 'Short reason recorded in status_histories',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Longer context recorded in status_histories',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectionReasonDto {
  @ApiProperty({
    example: 'Documents do not match the registry',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  rejectionReason!: string;
}

/** Assign a triage row (verification or report) to an admin account. */
export class AssignAdminDto {
  @ApiProperty({
    type: String,
    format: 'ObjectId',
    description: 'Admin user id taking ownership',
  })
  @IsMongoId()
  assignedAdminId!: string;
}
