import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { REPORT_TARGET_TYPES } from '../report.schema';

export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: (typeof REPORT_TARGET_TYPES)[number];

  @IsMongoId()
  targetId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
