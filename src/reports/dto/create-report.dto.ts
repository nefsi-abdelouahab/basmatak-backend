import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REPORT_TARGET_TYPES } from '../report.schema';

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
}
