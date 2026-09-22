import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { MediaCollection, MediaModel } from '../src/media/schemas/media.schema';
import { TestStorageProvider } from '../src/media/storage/test-storage.provider';
import { STORAGE_PROVIDER } from '../src/media/storage/storage-provider.interface';
import { createTestApp, TestAppHandle } from './utils/test-db';

const silentMail = {
  sendVerificationEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
};

describe('media e2e (S8) — presigned uploads, confirm, links, visibility, F6 delete', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let mediaModel: Model<MediaModel>;
  let storage: TestStorageProvider;

  let ownerToken: string;
  let strangerToken: string;

  const authed = (
    token: string,
    method: 'post' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  const get = (token: string | undefined, path: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1${path}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function register(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send({ email, password: 'Password123!' })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function upload(
    token: string,
    purpose: string,
    override: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
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
  }

  beforeAll(async () => {
    storage = new TestStorageProvider();
    handle = await createTestApp([], {
      env: { EMAIL_VERIFICATION_REQUIRED: 'false' },
      providers: [
        { token: MAIL_SERVICE, useValue: silentMail },
        { token: STORAGE_PROVIDER, useValue: storage },
      ],
    });
    app = handle.app;
    mediaModel = app.get(getModelToken(MediaCollection));

    ownerToken = await register('media-owner@test.dz');
    strangerToken = await register('media-stranger@test.dz');
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  it('requests a presigned upload intent from a double provider', async () => {
    const res = await upload(ownerToken, 'avatar');
    expect(res.body.mediaId).toBeTruthy();
    expect(res.body.uploadUrl).toContain('upload');
    expect(storage.uploads).toHaveLength(1);
  });

  it('rejects non-allowlisted uploads and oversized files with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        filename: 'x.gif',
        mimeType: 'image/gif',
        size: 1024,
        purpose: 'avatar',
      })
      .expect(400);

    const big = await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        filename: 'x.png',
        mimeType: 'image/png',
        size: 5 * 1024 * 1024 + 1,
        purpose: 'avatar',
      })
      .expect(400);
    expect(big.body.code).toBe('VALIDATION_ERROR');

    const badPurpose = await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        filename: 'x.png',
        mimeType: 'image/png',
        size: 1024,
        purpose: 'banner',
      })
      .expect(400);
    expect(badPurpose.body.code).toBe('VALIDATION_ERROR');
  });

  it('confirms uploads idempotently and rejects metadata mismatches (F17)', async () => {
    const ok = await upload(ownerToken, 'submission_evidence');
    const okId = ok.body.mediaId as string;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/media/${okId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(first.body.confirmedAt).toBeTruthy();

    const second = await request(app.getHttpServer())
      .post(`/api/v1/media/${okId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(second.body.confirmedAt).toBe(first.body.confirmedAt);

    const mismatched = await upload(ownerToken, 'submission_evidence', {
      size: 1234,
      mimeType: 'image/png',
    });
    const mismatchId = mismatched.body.mediaId as string;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/media/${mismatchId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('MEDIA_METADATA_MISMATCH');
  });

  it('registers links from the allowlist and rejects foreign hosts', async () => {
    const link = await request(app.getHttpServer())
      .post('/api/v1/media/links')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        url: 'https://www.youtube.com/watch?v=abc',
        purpose: 'submission_evidence',
      })
      .expect(201);
    expect(link.body.type).toBe('link');

    const evil = await request(app.getHttpServer())
      .post('/api/v1/media/links')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        url: 'https://evil.example.com/x',
        purpose: 'submission_evidence',
      })
      .expect(400);
    expect(evil.body.code).toBe('LINK_HOST_NOT_ALLOWED');
  });

  it('gates reads by visibility: guest 404, stranger 403 on private, owner ok', async () => {
    const publicStream = await upload(ownerToken, 'avatar');
    const privateStream = await upload(ownerToken, 'avatar', {
      visibility: 'private',
    });

    await get(undefined, `/media/${publicStream.body.mediaId}`).expect(404);

    const strangerPublic = await get(
      strangerToken,
      `/media/${publicStream.body.mediaId}`,
    ).expect(200);
    expect(strangerPublic.body.url).toContain('read');

    await get(strangerToken, `/media/${privateStream.body.mediaId}`).expect(
      403,
    );

    const ownerRead = await get(
      ownerToken,
      `/media/${privateStream.body.mediaId}`,
    ).expect(200);
    expect(ownerRead.body.url).toContain('read');
  });

  it('soft-deletes owned media, 404s foreign deletions, and blocks attached rows', async () => {
    const deletable = await upload(ownerToken, 'avatar');
    const attached = await upload(ownerToken, 'submission_evidence');
    await mediaModel
      .updateOne(
        { _id: attached.body.mediaId },
        { $set: { submissionId: new Types.ObjectId() } },
      )
      .exec();

    await authed(
      strangerToken,
      'delete',
      `/media/${deletable.body.mediaId}`,
    ).expect(404);
    await authed(
      ownerToken,
      'delete',
      `/media/${attached.body.mediaId}`,
    ).expect(409);

    await authed(
      ownerToken,
      'delete',
      `/media/${deletable.body.mediaId}`,
    ).expect(204);
    await get(ownerToken, `/media/${deletable.body.mediaId}`).expect(404);

    const row = await mediaModel.findById(deletable.body.mediaId).exec();
    expect(row!.deletedAt).toBeInstanceOf(Date);
  });

  it('hides media from other routes once soft-deleted (F9 regression)', async () => {
    const avatar = await upload(ownerToken, 'avatar');
    const id = avatar.body.mediaId as string;

    await request(app.getHttpServer())
      .patch('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ avatar: id })
      .expect(200);
    await authed(ownerToken, 'delete', `/media/${id}`).expect(204);

    const res = await request(app.getHttpServer())
      .patch('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ avatar: id })
      .expect(404);
    expect(res.body.code).toBe('MEDIA_NOT_FOUND');
  });
});
