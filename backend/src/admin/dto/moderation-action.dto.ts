import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Neutral moderation action vocabulary (RP §3.5#11 — no "sanction" wording). */
export const MODERATION_ACTION_TYPES = [
  'unpublish_opportunity',
  'close_opportunity',
  'suspend_target',
  'notice',
] as const;

export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

/** Target types each action may execute against (compatibility matrix). */
export const MODERATION_ACTION_TARGETS: Record<
  ModerationActionType,
  readonly string[]
> = {
  unpublish_opportunity: ['opportunity'],
  close_opportunity: ['opportunity'],
  suspend_target: ['user', 'organization'],
  notice: ['opportunity', 'user', 'organization', 'review', 'submission'],
};

export class ModerationNoticePayloadDto {
  @ApiProperty({ type: String, format: 'ObjectId' })
  @IsMongoId()
  userId!: string;

  @ApiProperty({ description: 'Neutral system-notice text', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}

export class ModerationActionDto {
  @ApiProperty({ enum: MODERATION_ACTION_TYPES })
  @IsIn(MODERATION_ACTION_TYPES)
  type!: ModerationActionType;

  @ApiPropertyOptional({
    description:
      'Required for `notice` (recipient + text); rejected for other actions',
  })
  @ValidateIf((o: ModerationActionDto) => o.type === 'notice')
  @IsDefined()
  @ValidateNested()
  @Type(() => ModerationNoticePayloadDto)
  payload?: ModerationNoticePayloadDto;
}

export class AdminNoticeDto {
  @ApiProperty({ description: 'Neutral system-notice text', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}
