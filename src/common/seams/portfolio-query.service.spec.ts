import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../../test/utils/memory-connection';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from '../../media/schemas/media.schema';
import {
  PortfolioItemModel,
  PortfolioItemsCollection,
  PortfolioItemSchema,
} from '../../portfolio/schemas/portfolio-item.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
  defaultPublicProfile,
} from '../../volunteers/schemas/volunteer-profile.schema';
import { PortfolioQueryService } from './portfolio-query.service';

describe('PortfolioQueryService (S14 real read)', () => {
  let handle: MemoryConnectionHandle;
  let profileModel: Model<VolunteerProfileModel>;
  let portfolioModel: Model<PortfolioItemModel>;
  let mediaModel: Model<MediaModel>;
  let service: PortfolioQueryService;

  const userId = new Types.ObjectId();
  const username = 'sami';

  async function enableProfile(): Promise<void> {
    await profileModel.updateOne(
      { username },
      { $set: { 'publicProfile.enabled': true } },
    );
  }

  async function createProfile(): Promise<void> {
    await profileModel.create({
      userId,
      username,
      publicProfile: defaultPublicProfile(),
    });
  }

  async function createPublicItem(
    title: string,
    order: number,
    mediaIds: string[],
    visibility: 'public' | 'private' = 'public',
    metadata: { typeLabel?: string; tags?: string[] } = {},
  ): Promise<void> {
    await portfolioModel.create({
      volunteerId: userId,
      title,
      mediaIds: mediaIds.map((id) => new Types.ObjectId(id)),
      visibility,
      order,
      ...(metadata.typeLabel !== undefined
        ? { typeLabel: metadata.typeLabel }
        : {}),
      tags: metadata.tags ?? [],
    });
  }

  async function createMedia(
    idHint: string,
    overrides: Partial<MediaModel> = {},
  ): Promise<string> {
    const row = await mediaModel.create({
      _id: new Types.ObjectId(),
      ownerId: userId,
      purpose: 'portfolio_item',
      visibility: 'public',
      type: 'file',
      filename: `${idHint}.png`,
      mimeType: 'image/png',
      size: 42000,
      ...overrides,
    });
    return row._id.toString();
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    portfolioModel = handle.connection.model<PortfolioItemModel>(
      PortfolioItemsCollection,
      PortfolioItemSchema,
    );
    mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );
    service = new PortfolioQueryService(
      profileModel,
      portfolioModel,
      mediaModel,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all([
      handle.connection.collection(VolunteerProfilesCollection).deleteMany({}),
      handle.connection.collection(PortfolioItemsCollection).deleteMany({}),
      handle.connection.collection(MediaCollection).deleteMany({}),
    ]);
  });

  it('404s on an unknown username', async () => {
    await expect(service.getPublicPortfolio(username)).rejects.toMatchObject({
      status: 404,
      code: 'VOLUNTEER_NOT_FOUND',
    });
  });

  it('404s on a profile whose publicProfile.enabled=false (A5)', async () => {
    await profileModel.create({
      userId,
      username,
      publicProfile: { ...defaultPublicProfile(), enabled: false },
    });
    await expect(service.getPublicPortfolio(username)).rejects.toMatchObject({
      status: 404,
      code: 'VOLUNTEER_NOT_FOUND',
    });
  });

  it('filter: only public items, order ascending, media restricted to public rows', async () => {
    const mPublic = await createMedia('public-m');
    const mPrivate = await createMedia('private-m', {
      visibility: 'private',
    });
    const mDeleted = await createMedia('deleted-m', {
      deletedAt: new Date(),
    });
    await createProfile();
    await enableProfile();

    await createPublicItem('Visible', 1, [mPublic, mPrivate, mDeleted]);
    await createPublicItem('Hidden-private', 0, [mPublic], 'private');
    await createPublicItem('Later', 2, [mPublic]);

    const result = await service.getPublicPortfolio(username);
    expect(result.items.map((i) => i.title)).toEqual(['Visible', 'Later']);
    expect(result.items[0]).toMatchObject({
      title: 'Visible',
      mediaId: mPublic,
      media: [expect.objectContaining({ mediaId: mPublic })],
    });
  });

  it('does not leak any media metadata when all related media is private', async () => {
    const m = await createMedia('m', { visibility: 'private' });
    await createProfile();
    await enableProfile();
    await createPublicItem('Solo', 0, [m]);
    const result = await service.getPublicPortfolio(username);
    expect(result.items[0].media).toEqual([]);
  });

  it('keeps the public interface source-compatible (id + optional extras)', async () => {
    const m = await createMedia('m');
    await createProfile();
    await enableProfile();
    await createPublicItem('One', 0, [m]);
    const result = await service.getPublicPortfolio(username);
    expect(result.items[0].id).toBeTruthy();
    expect(typeof result.items[0].id).toBe('string');
    expect(result.items[0].mediaId).toBe(m);
  });

  it('surfaces typeLabel/tags on public items and omits absent typeLabel', async () => {
    await createProfile();
    await enableProfile();
    await createPublicItem('Labelled', 0, [], 'public', {
      typeLabel: 'Audio',
      tags: ['Field', 'Recording'],
    });
    await createPublicItem('Bare', 1, []);

    const result = await service.getPublicPortfolio(username);
    expect(result.items[0]).toMatchObject({
      title: 'Labelled',
      typeLabel: 'Audio',
      tags: ['Field', 'Recording'],
    });
    expect(result.items[1]).toMatchObject({ title: 'Bare' });
    expect(result.items[1].typeLabel).toBeUndefined();
    expect(result.items[1].tags).toEqual([]);
  });
});
