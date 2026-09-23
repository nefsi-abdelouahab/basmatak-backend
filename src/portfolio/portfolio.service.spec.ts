import { Model, Types } from 'mongoose';
import { MediaOwnership } from '../common/seams/media-ownership';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from '../media/schemas/media.schema';
import { PortfolioService } from './portfolio.service';
import {
  PortfolioItemModel,
  PortfolioItemsCollection,
  PortfolioItemSchema,
} from './schemas/portfolio-item.schema';

describe('PortfolioService (S14)', () => {
  let handle: MemoryConnectionHandle;
  let portfolioModel: Model<PortfolioItemModel>;
  let mediaModel: Model<MediaModel>;
  let ownership: MediaOwnership;
  let service: PortfolioService;

  const volunteerId = new Types.ObjectId().toString();
  const otherId = new Types.ObjectId().toString();

  function actor(
    sub = volunteerId,
    role: AccountToken['role'] = 'volunteer',
  ): AccountToken {
    return { sub, role, sessionId: '64b000000000000000000020' };
  }

  /** Creates N portfolio_item-purpose media rows owned by `ownerId`. */
  async function createMedia(
    ownerId: string,
    count: number,
    overrides: Partial<MediaModel> = {},
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = await mediaModel.create({
        ownerId: new Types.ObjectId(ownerId),
        purpose: 'portfolio_item',
        visibility: 'public',
        type: 'file',
        filename: `item-${i}.png`,
        mimeType: 'image/png',
        size: 42000,
        ...overrides,
      });
      ids.push(row._id.toString());
    }
    return ids;
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    portfolioModel = handle.connection.model<PortfolioItemModel>(
      PortfolioItemsCollection,
      PortfolioItemSchema,
    );
    mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );
    ownership = new MediaOwnership(mediaModel);
    service = new PortfolioService(
      handle.connection,
      portfolioModel,
      mediaModel,
      ownership,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all([
      handle.connection.collection(PortfolioItemsCollection).deleteMany({}),
      handle.connection.collection(MediaCollection).deleteMany({}),
    ]);
  });

  describe('create', () => {
    it('appends order after the current max and links media', async () => {
      const [m1, m2] = await createMedia(volunteerId, 2);
      const first = await service.create(actor(), {
        title: 'First',
        mediaIds: [m1],
      });
      expect(first).toMatchObject({ order: 0, visibility: 'public' });

      const second = await service.create(actor(), {
        title: 'Second',
        mediaIds: [m2],
      });
      expect(second).toMatchObject({ order: 1, mediaIds: [m2] });

      await expect(mediaModel.findById(m1).exec()).resolves.toMatchObject({
        portfolioItemId: new Types.ObjectId(first.id),
      });
      await expect(mediaModel.findById(m2).exec()).resolves.toMatchObject({
        portfolioItemId: new Types.ObjectId(second.id),
      });
    });

    it('rejects foreign media as 404 MEDIA_NOT_FOUND', async () => {
      const [foreign] = await createMedia(otherId, 1);
      await expect(
        service.create(actor(), { title: 'P', mediaIds: [foreign] }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
    });

    it('rejects wrong-purpose media as 409 MEDIA_PURPOSE_MISMATCH', async () => {
      const [avatar] = await createMedia(volunteerId, 1, {
        purpose: 'avatar' as never,
      });
      await expect(
        service.create(actor(), { title: 'P', mediaIds: [avatar] }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'MEDIA_PURPOSE_MISMATCH',
      });
    });

    it('rejects media already linked to another item as 409', async () => {
      const [m1] = await createMedia(volunteerId, 1);
      await service.create(actor(), { title: 'Holder', mediaIds: [m1] });
      await expect(
        service.create(actor(), { title: 'Fails', mediaIds: [m1] }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'MEDIA_ALREADY_LINKED',
      });
    });

    it('dedupes repeated media ids', async () => {
      const [m1] = await createMedia(volunteerId, 1);
      const item = await service.create(actor(), {
        title: 'Dup',
        mediaIds: [m1, m1],
      });
      expect(item.mediaIds).toEqual([m1]);
      expect(item.media).toHaveLength(1);
    });

    it('defaults visibility to public and order 0 for the first item', async () => {
      const item = await service.create(actor(), { title: 'Solo' });
      expect(item).toMatchObject({ order: 0, visibility: 'public', media: [] });
    });
  });

  describe('listMine', () => {
    it('returns only own items ordered by order ascending, never foreign rows', async () => {
      await createMedia(otherId, 1);
      await service.create(actor(), { title: 'A' });
      await service.create(actor(), { title: 'B' });
      const rows = await service.listMine(actor());
      expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
      expect(rows.map((r) => r.order)).toEqual([0, 1]);
      expect(rows[0].media).toEqual([]);
    });
  });

  describe('update', () => {
    it('reconciles linkage: sets added, clears removed', async () => {
      const [m1, m2] = await createMedia(volunteerId, 2);
      const item = await service.create(actor(), {
        title: 'Before',
        mediaIds: [m1],
      });

      const updated = await service.update(actor(), item.id, {
        title: 'After',
        description: 'updated',
        mediaIds: [m2],
      });
      expect(updated).toMatchObject({ title: 'After', mediaIds: [m2] });

      await expect(mediaModel.findById(m1).exec()).resolves.toMatchObject({
        portfolioItemId: undefined,
      });
      await expect(mediaModel.findById(m2).exec()).resolves.toMatchObject({
        portfolioItemId: new Types.ObjectId(item.id),
      });
    });

    it('allows re-adding an already-linked owned media (idempotent)', async () => {
      const [m1] = await createMedia(volunteerId, 1);
      const item = await service.create(actor(), {
        title: 'Many',
        mediaIds: [m1],
      });
      const updated = await service.update(actor(), item.id, {
        mediaIds: [m1],
      });
      expect(updated.mediaIds).toEqual([m1]);
    });

    it('rejects a foreign item as 404 PORTFOLIO_ITEM_NOT_FOUND', async () => {
      const foreign = await service.create(actor(otherId), { title: 'Theirs' });
      await expect(
        service.update(actor(), foreign.id, { title: 'Mine now' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PORTFOLIO_ITEM_NOT_FOUND',
      });
    });

    it('rejects media linked to another item during reconcile as 409', async () => {
      const [m1] = await createMedia(volunteerId, 1);
      const holder = await service.create(actor(), {
        title: 'Holder',
        mediaIds: [m1],
      });
      const target = await service.create(actor(), { title: 'Target' });
      void holder;
      await expect(
        service.update(actor(), target.id, { mediaIds: [m1] }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'MEDIA_ALREADY_LINKED',
      });
    });

    it('rejects malformed item id as 404', async () => {
      await expect(
        service.update(actor(), 'nope', { title: 'X' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PORTFOLIO_ITEM_NOT_FOUND',
      });
    });
  });

  describe('delete', () => {
    it('deletes the item and clears its media linkage', async () => {
      const [m1] = await createMedia(volunteerId, 1);
      const item = await service.create(actor(), {
        title: 'Gone',
        mediaIds: [m1],
      });
      await service.delete(actor(), item.id);

      await expect(portfolioModel.findById(item.id).exec()).resolves.toBeNull();
      await expect(mediaModel.findById(m1).exec()).resolves.toMatchObject({
        portfolioItemId: undefined,
      });
    });

    it('ignores foreign items (404)', async () => {
      const foreign = await service.create(actor(otherId), { title: 'Theirs' });
      await expect(service.delete(actor(), foreign.id)).rejects.toMatchObject({
        status: 404,
        code: 'PORTFOLIO_ITEM_NOT_FOUND',
      });
      await expect(
        portfolioModel.findById(foreign.id).exec(),
      ).resolves.not.toBeNull();
    });
  });

  describe('reorder', () => {
    it('persists a submitted permutation atomically', async () => {
      await service.create(actor(), { title: 'A' });
      await service.create(actor(), { title: 'B' });
      await service.create(actor(), { title: 'C' });

      const rows = await service.listMine(actor());
      const reversed = rows.map((r) => r.id).reverse();
      const result = await service.reorder(actor(), { itemIds: reversed });
      expect(result.map((r) => r.order)).toEqual([0, 1, 2]);
      expect(result.map((r) => r.title)).toEqual(['C', 'B', 'A']);
    });

    it('rejects a set mismatch without writing anything', async () => {
      const a = (await service.create(actor(), { title: 'A' })).id;
      const b = (await service.create(actor(otherId), { title: 'Theirs' })).id;
      const before = await service.listMine(actor());
      const beforeOrder = before[0].order;

      await expect(
        service.reorder(actor(), { itemIds: [a, b] }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'PORTFOLIO_REORDER_CONFLICT',
      });

      const after = await service.listMine(actor());
      expect(after[0].id).toBe(a);
      expect(after[0].order).toBe(beforeOrder);
    });

    it('converges concurrent reorder calls to one full permutation', async () => {
      await service.create(actor(), { title: 'A' });
      await service.create(actor(), { title: 'B' });
      await service.create(actor(), { title: 'C' });
      const rows = await service.listMine(actor());
      const forward = rows.map((r) => r.id);
      const backward = [...forward].reverse();

      await Promise.all([
        service.reorder(actor(), { itemIds: forward }),
        service.reorder(actor(), { itemIds: backward }),
        service.reorder(actor(), { itemIds: backward }),
        service.reorder(actor(), { itemIds: forward }),
      ]);

      const result = await service.listMine(actor());
      const titles = result.map((r) => r.title);
      const finalSequence = result.map((r) => r.id);
      const isForward = finalSequence.join() === forward.join();
      const isBackward = finalSequence.join() === backward.join();
      expect(isForward || isBackward).toBe(true);
      expect(titles).toEqual(isBackward ? ['C', 'B', 'A'] : ['A', 'B', 'C']);
    });
  });
});
