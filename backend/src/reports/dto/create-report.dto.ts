import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REPORT_PRIORITIES, REPORT_TARGET_TYPES } from '../report.schema';

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES })
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: (typeof REPORT_TARGET_TYPES)[number];

  @ApiProperty({
    type: String,
    format: 'ObjectId',
    description: 'Target entity id',
  })
  @IsMongoId()
  targetId!: string;

  @ApiProperty({ example: 'Inappropriate content', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Longer context for moderators',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Moderator-facing title',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: REPORT_PRIORITIES, default: 'normal' })
  @IsOptional()
  @IsIn(REPORT_PRIORITIES)
  priority?: (typeof REPORT_PRIORITIES)[number];
}
