import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  StatusHistoryModel,
  StatusHistoryCollection,
} from './status-histories.schema';
import { StatusTransitionRegistry } from './status-transition.registry';

export interface AssertTransitionInput {
  entityType: string;
  entityId: Types.ObjectId | string;
  from: string;
  to: string;
  actor: Types.ObjectId | string;
  /** Optional short reason (≤500 chars) persisted on the history entry. */
  reason?: string;
  /** Optional longer notes (≤2000 chars) persisted on the history entry. */
  notes?: string;
  session?: ClientSession;
}

/**
 * Single status-transition path (inventory §0, roadmap S1).
 * Validates against the entity whitelist, writes `status_histories` and
 * returns the entry. It does NOT mutate the entity — owning modules perform
 * the state change and then call `assert`. `session` lets transactional flows
 * (S7/S11) write histories inside the same transaction.
 */
@Injectable()
export class StatusTransitionService {
  constructor(
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
    private readonly registry: StatusTransitionRegistry,
  ) {}

  async assert(input: AssertTransitionInput): Promise<StatusHistoryModel> {
    const { entityType, entityId, from, to, actor, reason, notes, session } =
      input;

    if (reason !== undefined && reason.length > 500) {
      throw new BusinessException(
        'INVALID_STATUS_REASON',
        'Status change reason must be 500 characters or fewer',
        400,
      );
    }
    if (notes !== undefined && notes.length > 2000) {
      throw new BusinessException(
        'INVALID_STATUS_NOTES',
        'Status change notes must be 2000 characters or fewer',
        400,
      );
    }

    if (!this.registry.isRegistered(entityType)) {
      throw new BusinessException(
        'ENTITY_TRANSITIONS_NOT_REGISTERED',
        `No transition whitelist registered for entity type '${entityType}'`,
        500,
      );
    }
    if (!this.registry.isAllowed(entityType, from, to)) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `Invalid status transition '${from}' -> '${to}' for ${entityType}`,
        409,
      );
    }

    const [entry] = await this.historyModel.create(
      [
        {
          entityType,
          entityId: new Types.ObjectId(String(entityId)),
          from,
          to,
          actor: new Types.ObjectId(String(actor)),
          ...(reason !== undefined ? { reason } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      ],
      session ? { session } : undefined,
    );
    return entry;
  }
}
