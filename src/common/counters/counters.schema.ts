import { Document, Schema } from 'mongoose';
import { createSchema } from '../schema/base.schema';

/** The four registry id families this session owns (RP Part 7 core row). */
export type RegistryCounterType =
  'volunteer' | 'organization' | 'opportunity' | 'experience';

export interface CounterRow {
  seq: number;
}

export class CounterRowModel extends Document implements CounterRow {
  seq!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CountersCollection = 'counters';

/**
 * Per-type sequence rows (inventory �2.1 core; roadmap registry-ids). `_id`
 * IS the type key, so uniqueness of one-counter-per-type is the primary key
 * itself; `seq` starts at 0 and is advanced atomically by `RegistryIdService`
 * via `findOneAndUpdate { $inc }` (the first mint lands `seq=1`).
 */
export const CounterSchema: Schema<CounterRowModel> = createSchema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0, min: 0 },
});
