import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { MediaCollection, MediaModel } from '../src/media/schemas/media.schema';
import { TestStorageProvider } from '../src/media/storage/test-storage.provider';
import { STORAGE_PROVIDER } from '../src/media/storage/storage-provider.interface';
import { PortfolioItemsCollection } from '../src/portfolio/schemas/portfolio-item.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

const silentMail = {
  sendVerificationEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
};

describe('portfolio e2e (S14) — curated showcase CRUD, media linkage, public read', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let mediaModel: Model<MediaModel>;
  let storage: TestStorageProvider;

  let ownerToken: string;
  let strangerToken: string;
  let ownerUsername: string;
  let strangerUsername: string;

  const authed = (
    token: string,
    method: 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  const get = (token: string | undefined, path: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1${path}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function register(
    email: string,
  ): Promise<{ token: string; username: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const username = email.split('@')[0].replace(/[^a-z0-9]+/gi, '-');
    return { token: res.body.accessToken as string, username };
  }

  async function upload(
    token: string,
    purpose: string,
    override: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose,
        ...override,
      })
      .expect(201);
    const mediaId = res.body.mediaId as string;
    await request(app.getHttpServer())
      .post(`/api/v1/media/${mediaId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return mediaId;
  }

  async function createItem(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; body: Record<string, unknown> }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolio/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return { id: res.body.id as string, body: res.body };
  }

  beforeAll(async () => {
    storage = new TestStorageProvider();
    handle = await createTestApp([], {
      env: {
        EMAIL_VERIFICATION_REQUIRED: 'false',
        THROTTLE_LIMIT: '2000',
      },
      providers: [
        { token: MAIL_SERVICE, useValue: silentMail },
        { token: STORAGE_PROVIDER, useValue: storage },
      ],
    });
    app = handle.app;
    mediaModel = app.get(getModelToken(MediaCollection));

    const owner = await register('portfolio-owner@test.dz');
    ownerToken = owner.token;
    ownerUsername = owner.username;
    const stranger = await register('portfolio-stranger@test.dz');
    strangerToken = stranger.token;
    strangerUsername = stranger.username;
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  beforeEach(async () => {
    await app.get(getModelToken(PortfolioItemsCollection)).deleteMany({});
    await mediaModel.deleteMany({});
    storage.clear();
  });

  it('requires a volunteer token on all personal routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/portfolio/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/portfolio/me')
      .send({ title: 'P' })
      .expect(401);
  });

  it('validates the payload (title required, media must be object ids)', async () => {
    await authed(ownerToken, 'post', '/portfolio/me').send({}).expect(400);
    await authed(ownerToken, 'post', '/portfolio/me')
      .send({ title: 'P', mediaIds: ['not-an-id'] })
      .expect(400);
  });

  it('creates items appending order, with media linkage and hydrated metadata', async () => {
    const mediaId = await upload(ownerToken, 'portfolio_item');

    const first = await createItem(ownerToken, {
      title: 'Soup kitchen',
      description: 'Ran the evening shift',
      mediaIds: [mediaId],
    });
    expect(first.body).toMatchObject({
      title: 'Soup kitchen',
      description: 'Ran the evening shift',
      visibility: 'public',
      order: 0,
      media: [
        expect.objectContaining({
          mediaId,
          type: 'file',
          mimeType: 'image/png',
        }),
      ],
    });

    const second = await createItem(ownerToken, { title: 'Beach cleanup' });
    expect(second.body).toMatchObject({ order: 1 });

    const all = await get(ownerToken, '/portfolio/me').expect(200);
    expect(all.body.map((i: { title: string }) => i.title)).toEqual([
      'Soup kitchen',
      'Beach cleanup',
    ]);

    const linked = await mediaModel.findById(mediaId).exec();
    expect(linked!.portfolioItemId?.toString()).toBe(first.id);
  });

  it('rejects media not owned, wrong purpose, or already linked, and foreign items', async () => {
    const strangerMedia = await upload(strangerToken, 'portfolio_item');
    await authed(ownerToken, 'post', '/portfolio/me')
      .send({ title: 'X', mediaIds: [strangerMedia] })
      .expect(404);

    const avatar = await upload(ownerToken, 'avatar');
    await authed(ownerToken, 'post', '/portfolio/me')
      .send({ title: 'X', mediaIds: [avatar] })
      .expect(409);

    const m1 = await upload(ownerToken, 'portfolio_item');
    await createItem(ownerToken, { title: 'Holder', mediaIds: [m1] });
    await authed(ownerToken, 'post', '/portfolio/me')
      .send({ title: 'Dup', mediaIds: [m1] })
      .expect(409);

    const strangerItem = await createItem(strangerToken, { title: 'Theirs' });
    await authed(ownerToken, 'patch', `/portfolio/${strangerItem.id}`)
      .send({ title: 'Mine now' })
      .expect(404);
    await authed(ownerToken, 'delete', `/portfolio/${strangerItem.id}`).expect(
      404,
    );
  });

  it('updates reconcile linkage: newly attached set, removed cleared', async () => {
    const m1 = await upload(ownerToken, 'portfolio_item');
    const m2 = await upload(ownerToken, 'portfolio_item');
    const item = await createItem(ownerToken, {
      title: 'Before',
      mediaIds: [m1],
    });

    const updated = await authed(ownerToken, 'patch', `/portfolio/${item.id}`)
      .send({ title: 'After', mediaIds: [m2] })
      .expect(200);
    expect(updated.body).toMatchObject({ title: 'After', mediaIds: [m2] });

    const cleared = await mediaModel.findById(m1).exec();
    expect(cleared!.portfolioItemId).toBeUndefined();
    const attached = await mediaModel.findById(m2).exec();
    expect(attached!.portfolioItemId?.toString()).toBe(item.id);
  });

  it('reorders atomically and persists the final sequence', async () => {
    const a = await createItem(ownerToken, { title: 'A' });
    const b = await createItem(ownerToken, { title: 'B' });
    const c = await createItem(ownerToken, { title: 'C' });

    const res = await authed(ownerToken, 'put', '/portfolio/me/order')
      .send({ itemIds: [c.id, a.id, b.id] })
      .expect(200);
    expect(res.body.map((i: { title: string }) => i.title)).toEqual([
      'C',
      'A',
      'B',
    ]);

    const fresh = await get(ownerToken, '/portfolio/me').expect(200);
    expect(fresh.body.map((i: { title: string }) => i.title)).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('rejects reorder set mismatches and partial lists with 409', async () => {
    const a = await createItem(ownerToken, { title: 'Only' });
    const foreignId = new Types.ObjectId().toString();
    const conflict = await authed(ownerToken, 'put', '/portfolio/me/order')
      .send({ itemIds: [a.id, foreignId] })
      .expect(409);
    expect(conflict.body.code).toBe('PORTFOLIO_REORDER_CONFLICT');
    await authed(ownerToken, 'put', '/portfolio/me/order')
      .send({ itemIds: [] })
      .expect(409);
    const stillOrdered = await app
      .get(getModelToken(PortfolioItemsCollection))
      .findOne({ _id: a.id })
      .exec();
    expect(stillOrdered!.order).toBe(0);
  });

  it('deletes an item and clears its media linkage (media deletable again)', async () => {
    const m1 = await upload(ownerToken, 'portfolio_item');
    const item = await createItem(ownerToken, {
      title: 'Remove me',
      mediaIds: [m1],
    });

    await authed(ownerToken, 'delete', `/portfolio/${item.id}`).expect(204);
    await get(ownerToken, `/portfolio/me`).expect(200);
    const rows = await app
      .get(getModelToken(PortfolioItemsCollection))
      .find({ _id: item.id })
      .exec();
    expect(rows).toHaveLength(0);

    const deleted = await mediaModel.findById(m1).exec();
    expect(deleted!.portfolioItemId).toBeUndefined();
  });

  it('serves the public read: 404 unless enabled, then public rows only with public media', async () => {
    await get(undefined, `/volunteers/${ownerUsername}/portfolio`).expect(404);

    const publicMedia = await upload(ownerToken, 'portfolio_item');
    const privateMedia = await upload(ownerToken, 'portfolio_item', {
      visibility: 'private',
    });
    const item = await createItem(ownerToken, {
      title: 'Public',
      mediaIds: [publicMedia, privateMedia],
    });
    await createItem(ownerToken, {
      title: 'Secret',
      visibility: 'private',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/volunteers/me/public-settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ publicProfile: { enabled: true } })
      .expect(200);

    const res = await get(
      undefined,
      `/volunteers/${ownerUsername}/portfolio`,
    ).expect(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      'Public',
    ]);
    expect(res.body.items[0]).toMatchObject({
      id: item.id,
      media: [expect.objectContaining({ mediaId: publicMedia })],
    });
    const mediaIds = res.body.items[0].media.map(
      (m: { mediaId: string }) => m.mediaId,
    );
    expect(mediaIds).not.toContain(privateMedia);

    await get(undefined, `/volunteers/unknown-user/portfolio`).expect(404);
  });

  it('does not leak portfolio data through the public profile of a disabled account', async () => {
    await get(undefined, `/volunteers/${strangerUsername}/portfolio`).expect(
      404,
    );
  });
});
