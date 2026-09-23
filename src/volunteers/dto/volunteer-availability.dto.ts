import { Type } from 'class-transformer';
import { IsArray, IsString, Matches, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DAY_KEYS } from '../schemas/volunteer-availability.schema';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TimeSlotDto {
  @ApiProperty({
    description: '24h HH:mm',
    example: '09:00',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
  })
  @IsString()
  @Matches(HHMM, { message: 'from must be 24h HH:mm' })
  from!: string;

  @ApiProperty({
    description: '24h HH:mm',
    example: '17:00',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
  })
  @IsString()
  @Matches(HHMM, { message: 'to must be 24h HH:mm' })
  to!: string;
}

/**
 * Replace-whole weekly schedule: every day key is required; each is an array
 * of `{ from, to }` slots. Unknown keys are rejected by the global pipe.
 */
export class UpdateAvailabilityDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Monday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  monday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Tuesday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  tuesday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Wednesday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  wednesday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Thursday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  thursday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Friday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  friday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Saturday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  saturday!: TimeSlotDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Sunday slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  sunday!: TimeSlotDto[];

  /** Validates that the set of day keys matches the schedule model. */
  static dayKeys(): readonly string[] {
    return DAY_KEYS;
  }
}
