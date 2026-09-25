import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PARTICIPANT_STATUSES } from '../schemas/task-participant.schema';

/** Query for `GET /organizations/me/participants` (Session 16). */
export class OrgParticipantsQueryDto {
  @ApiPropertyOptional({
    description:
      'Match on volunteer name/username, opportunity title, or position title',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Scope to one owned opportunity (ObjectId)',
  })
  @IsOptional()
  @IsString()
  opportunityId?: string;

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
