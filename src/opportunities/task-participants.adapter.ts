import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { Collection, Document } from 'mongodb';

/**
 * S6-only raw-driver adapter over `task_participants` and `applications`
 * (inventory §3 field shapes). Session 7 owns both collections through real
 * Mongoose models and replaces this adapter; this session only needs the job
 * activation and the "no accepted participants / no applications" guards.
 */
@Injectable()
export class TaskParticipantsAdapter {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private async collection(
    name: 'task_participants' | 'applications',
  ): Promise<Collection<Document> | null> {
    const db = this.connection.db;
    if (!db) {
      return null;
    }
    const exists = await db.listCollections({ name }).toArray();
    return exists.length > 0 ? db.collection(name) : null;
  }

  /** Moves every `accepted` participant of the opportunity to `active`. */
  async activateAcceptedForOpportunity(
    opportunityId: Types.ObjectId,
  ): Promise<number> {
    const collection = await this.collection('task_participants');
    if (!collection) {
      return 0;
    }
    const result = await collection.updateMany(
      { opportunityId, status: 'accepted' },
      { $set: { status: 'active' } },
    );
    return result.modifiedCount ?? 0;
  }

  /** Accepted-or-active participants of an opportunity (guards S6 writable edits). */
  async countAccepted(opportunityId: Types.ObjectId): Promise<number> {
    const collection = await this.collection('task_participants');
    if (!collection) {
      return 0;
    }
    return collection.countDocuments({
      opportunityId,
      status: { $in: ['accepted', 'active'] },
    });
  }

  /** Applications referencing a position (position-delete guard). */
  async countByPosition(positionId: Types.ObjectId): Promise<number> {
    const collection = await this.collection('applications');
    if (!collection) {
      return 0;
    }
    return collection.countDocuments({ positionId });
  }
}
