import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationListQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}
