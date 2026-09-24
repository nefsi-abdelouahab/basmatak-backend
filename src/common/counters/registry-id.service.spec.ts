import { ClientSession, Model } from 'mongoose';
import {
  CounterRowModel,
  CounterSchema,
  CountersCollection,
  RegistryCounterType,
} from './counters.schema';
import { RegistryIdService } from './registry-id.service';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../../test/utils/memory-connection';

describe('RegistryIdService', () => {
  let handle: MemoryConnectionHandle;
  let counterModel: Model<CounterRowModel>;
  let service: RegistryIdService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    counterModel = handle.connection.model<CounterRowModel>(
      CountersCollection,
      CounterSchema,
    );
    service = new RegistryIdService(counterModel);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(CountersCollection).deleteMany({});
  });

  it('returns distinct contiguous values under concurrent mints', async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => service.getNext('volunteer')),
    );
    expect(new Set(ids).size).toBe(20);
    const seqs = ids
      .map((id) => Number(id.slice('VOL-'.length)))
      .sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('zero-pads the sequence to six digits', async () => {
    await handle.connection
      .collection<{ _id: string; seq: number }>(CountersCollection)
      .insertOne({ _id: 'experience', seq: 41 });
    await expect(service.getNext('experience')).resolves.toBe('EXP-000042');
  });

  it('keeps full digits past six figures', async () => {
    await handle.connection
      .collection<{ _id: string; seq: number }>(CountersCollection)
      .insertOne({ _id: 'organization', seq: 999999 });
    await expect(service.getNext('organization')).resolves.toBe('ORG-1000000');
  });

  it('propagates the session option into the update', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'opportunity', seq: 1 });
    const findSpy = jest
      .spyOn(counterModel, 'findOneAndUpdate')
      .mockReturnValue({ exec } as unknown as ReturnType<
        Model<CounterRowModel>['findOneAndUpdate']
      >);
    const fakeSession = {
      inTransaction: () => true,
    } as unknown as ClientSession;
    await service.getNext('opportunity', { session: fakeSession });
    expect(findSpy).toHaveBeenLastCalledWith(
      { _id: 'opportunity' },
      { $inc: { seq: 1 } },
      expect.objectContaining({
        upsert: true,
        returnDocument: 'after',
        session: fakeSession,
      }),
    );
    findSpy.mockRestore();
  });

  it('rejects unknown registry types', async () => {
    await expect(
      service.getNext('bogus' as RegistryCounterType),
    ).rejects.toThrow(/Unknown registry type/);
  });
});
