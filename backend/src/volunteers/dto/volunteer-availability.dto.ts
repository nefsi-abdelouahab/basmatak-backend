import { Type } from 'class-transformer';
import { IsArray, IsString, Matches, ValidateNested } from 'class-validator';
import { DAY_KEYS } from '../schemas/volunteer-availability.schema';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TimeSlotDto {
  @IsString()
  @Matches(HHMM, { message: 'from must be 24h HH:mm' })
  from!: string;

  @IsString()
  @Matches(HHMM, { message: 'to must be 24h HH:mm' })
  to!: string;
}

/**
 * Replace-whole weekly schedule: every day key is required; each is an array
 * of `{ from, to }` slots. Unknown keys are rejected by the global pipe.
 */
export class UpdateAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  monday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  tuesday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  wednesday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  thursday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  friday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  saturday!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  sunday!: TimeSlotDto[];

  /** Validates that the set of day keys matches the schedule model. */
  static dayKeys(): readonly string[] {
    return DAY_KEYS;
  }
}
