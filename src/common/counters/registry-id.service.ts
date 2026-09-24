import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  CounterRowModel,
  CountersCollection,
  RegistryCounterType,
} from './counters.schema';

/** Prefix per registry type: `VOL-`, `ORG-`, `OPP-`, `EXP-` (RP Part 7). */
export const REGISTRY_PREFIX: Record<RegistryCounterType, string> = {
  volunteer: 'VOL-',
  organization: 'ORG-',
  opportunity: 'OPP-',
  experience: 'EXP-',
};

export interface GetNextOptions {
  /** Optional Mongo session so the increment joins a surrounding transaction. */
  session?: ClientSession;
}

/**
 * Registry identifier service (roadmap registry-ids): the single owner of the
 * neutral public registry ids. `getNext(type)` atomically increments the
 * type's counter with `findOneAndUpdate { $inc }` + upsert on the `_id`
 * primary key, so concurrent callers can never observe the same sequence
 * value (collision-proof). The identifier is `<PREFIX><seq>` with the
 * sequence zero-padded to six digits; prefix/format is intentionally local to
 * this service so later sessions only consume the returned string.
 */
@Injectable()
export class RegistryIdService {
  constructor(
    @InjectModel(CountersCollection)
    private readonly counterModel: Model<CounterRowModel>,
  ) {}

  async getNext(
    type: RegistryCounterType,
    options: GetNextOptions = {},
  ): Promise<string> {
    const prefix = REGISTRY_PREFIX[type];
    if (!prefix) {
      throw new Error(`Unknown registry type '${type}'`);
    }
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: type },
        { $inc: { seq: 1 } },
        {
          upsert: true,
          returnDocument: 'after',
          ...(options.session ? { session: options.session } : {}),
        },
      )
      .exec();
    if (!counter) {
      throw new Error(`Registry counter for '${type}' did not advance`);
    }
    return `${prefix}${String(counter.seq).padStart(6, '0')}`;
  }
}
