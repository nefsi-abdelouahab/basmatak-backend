import { Types } from 'mongoose';
import { StatusTransitionRegistry } from './status-transition.registry';
import { StatusTransitionService } from './status-transition.service';
import {
  StatusHistoryCollection,
  StatusHistoryModel,
  StatusHistorySchema,
} from './status-histories.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../../test/utils/memory-connection';

describe('StatusTransitionService', () => {
  let handle: MemoryConnectionHandle;
  let service: StatusTransitionService;
  const registry = new StatusTransitionRegistry();

  const entityId = new Types.ObjectId();
  const actor = new Types.ObjectId();

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const historyModel = handle.connection.model<StatusHistoryModel>(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    service = new StatusTransitionService(historyModel, registry);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
  });

  it('writes a status_histories entry for a valid transition', async () => {
    registry.register('opportunity', [
      ['draft', 'published'],
      ['published', 'in_progress'],
    ]);

    const entry = await service.assert({
      entityType: 'opportunity',
      entityId,
      from: 'draft',
      to: 'published',
      actor,
    });

    expect(entry.entityType).toBe('opportunity');
    expect(entry.from).toBe('draft');
    expect(entry.to).toBe('published');
    expect(entry.actor.toString()).toBe(actor.toString());

    const stored = await handle.connection
      .collection(StatusHistoryCollection)
      .findOne({ entityType: 'opportunity', entityId });
    expect(stored).not.toBeNull();
    expect(stored?.to).toBe('published');
  });

  it('throws INVALID_STATUS_TRANSITION for a disallowed pair and writes nothing', async () => {
    registry.register('opportunity', [['draft', 'published']]);

    await expect(
      service.assert({
        entityType: 'opportunity',
        entityId,
        from: 'completed',
        to: 'draft',
        actor,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });

    const count = await handle.connection
      .collection(StatusHistoryCollection)
      .countDocuments();
    expect(count).toBe(0);
  });

  it('throws ENTITY_TRANSITIONS_NOT_REGISTERED for an unknown entity type', async () => {
    await expect(
      service.assert({
        entityType: 'submission',
        entityId,
        from: 'draft',
        to: 'submitted',
        actor,
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_TRANSITIONS_NOT_REGISTERED' });
  });
});
