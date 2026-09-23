import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PARTICIPANT_STATUSES } from '../schemas/task-participant.schema';

export class ParticipationListQueryDto {
  @ApiPropertyOptional({ enum: PARTICIPANT_STATUSES })
  @IsOptional()
  @IsIn(PARTICIPANT_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class ParticipantsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class RemoveParticipationDto {
  @ApiProperty({ example: 'Failed to reach the volunteer', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
