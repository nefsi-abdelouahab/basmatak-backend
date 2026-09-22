import { IsOptional, IsString } from 'class-validator';

export class NotificationListQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
