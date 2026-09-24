import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsSeriesQueryDto {
  @ApiPropertyOptional({
    description: 'Trailing days of per-day activity (1–90, default 30)',
    minimum: 1,
    maximum: 90,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
