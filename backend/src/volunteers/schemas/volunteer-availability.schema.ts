import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface TimeSlot {
  from: string;
  to: string;
}

export const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export type WeeklySchedule = Record<DayKey, TimeSlot[]>;

/** Weekly availability, one row per volunteer (`volunteerId` unique). */
export interface VolunteerAvailability {
  volunteerId: Types.ObjectId;
  schedule: WeeklySchedule;
}

export class VolunteerAvailabilityModel
  extends Document
  implements VolunteerAvailability
{
  volunteerId!: Types.ObjectId;
  schedule!: WeeklySchedule;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VolunteerAvailabilitiesCollection = 'volunteer_availability';

export function emptySchedule(): WeeklySchedule {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

const timeSlotSchema = new Schema<TimeSlot>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false },
);

const scheduleSchema = new Schema<WeeklySchedule>(
  {
    monday: { type: [timeSlotSchema], default: [] },
    tuesday: { type: [timeSlotSchema], default: [] },
    wednesday: { type: [timeSlotSchema], default: [] },
    thursday: { type: [timeSlotSchema], default: [] },
    friday: { type: [timeSlotSchema], default: [] },
    saturday: { type: [timeSlotSchema], default: [] },
    sunday: { type: [timeSlotSchema], default: [] },
  },
  { _id: false },
);

export const VolunteerAvailabilitySchema: Schema<VolunteerAvailabilityModel> =
  createSchema({
    volunteerId: { type: Schema.Types.ObjectId, required: true },
    schedule: { type: scheduleSchema, required: true, default: emptySchedule },
  });

VolunteerAvailabilitySchema.index({ volunteerId: 1 }, { unique: true });
