import { randomUUID } from 'crypto';
import { Types } from 'mongoose';

/**
 * Entity-id keys inspected in event payloads to derive a stable notification
 * dedupe key. The key must be the same for a transactional in-txn write and the
 * post-commit bus event of the same flow (F4 dedupe rule): S7 writes in-transaction
 * rows with a flat `{ applicationId }` payload, while the same flow later emits a
 * bus event carrying the hydrated document (`{ application, opportunity }`), so the
 * helper reads both the flat keys and the nested document ids.
 */
const ENTITY_ID_KEYS = [
  'applicationId',
  'submissionId',
  'participationId',
  'opportunityId',
  'organizationId',
] as const;

/** Document refs whose `_id` keys a bus-event payload instead of a flat id. */
const NESTED_REF_KEYS = [
  'application',
  'submission',
  'participant',
  'opportunity',
  'organization',
] as const;

function readId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  return null;
}

function extractEntityId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;

  for (const key of ENTITY_ID_KEYS) {
    const value = readId(record[key]);
    if (value) {
      return value;
    }
  }

  for (const ref of NESTED_REF_KEYS) {
    const nested = record[ref];
    if (!nested || typeof nested !== 'object') {
      continue;
    }
    const doc = nested as Record<string, unknown>;
    const value = readId(doc._id ?? doc.id);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Builds the idempotency key shared by the transactional repository and the
 * bus handlers: `"<type>:<recipient>:<entityId>"`. Without a stable entity id
 * in the payload a per-instance random id is used (a single emit still yields
 * exactly one row; such events are not cross-checked against a transaction).
 */
export function buildNotificationKey(
  type: string,
  payload: unknown,
  recipientId: string,
): string {
  const entityId = extractEntityId(payload);
  return `${type}:${recipientId}:${entityId ?? randomUUID()}`;
}
