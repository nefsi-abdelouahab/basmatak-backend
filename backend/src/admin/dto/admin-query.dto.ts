import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UsersQueryDto {
  @IsOptional()
  @IsIn(['volunteer', 'organization', 'admin'])
  role?: string;

  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class UserStatusDto {
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}

export class VolunteersQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class OrganizationsListQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class OrganizationsVerificationsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class OrganizationStatusDto {
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}

export class RejectionReasonDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  rejectionReason!: string;
}
