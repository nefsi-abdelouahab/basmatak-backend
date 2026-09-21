import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/test-db';
import { ProbeModule } from './utils/probe.module';

describe('Internal jobs & error shape (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const handle = await createTestApp([ProbeModule]);
    app = handle.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/internal/jobs/run', () => {
    it('rejects a missing X-Jobs-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/run')
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(res.body.statusCode).toBe(401);
      expect(typeof res.body.message).toBe('string');
    });

    it('rejects a wrong X-Jobs-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/run')
        .set('X-Jobs-Key', 'wrong-key')
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('runs with a registered test handler and is idempotent', async () => {
      const jobRegistry = await app.get<{
        register: (name: string, run: () => Promise<unknown>) => void;
        unregister: (name: string) => void;
      }>('JobRegistry');

      let counter = 0;
      jobRegistry.register('test-counter', async () => {
        counter += 1;
      });

      try {
        const first = await request(app.getHttpServer())
          .post('/api/v1/internal/jobs/run')
          .set('X-Jobs-Key', process.env.JOBS_KEY ?? 'test-jobs-key')
          .expect(200);
        expect(first.body).toMatchObject({ ok: true, ran: 1 });
        expect(first.body.results[0]).toMatchObject({
          name: 'test-counter',
          ok: true,
        });
        expect(counter).toBe(1);

        await request(app.getHttpServer())
          .post('/api/v1/internal/jobs/run')
          .set('X-Jobs-Key', process.env.JOBS_KEY ?? 'test-jobs-key')
          .expect(200);
        expect(counter).toBe(2);
      } finally {
        jobRegistry.unregister('test-counter');
      }
    });

    it('reports per-handler failures without stopping the others', async () => {
      const jobRegistry = await app.get<{
        register: (name: string, run: () => Promise<unknown>) => void;
        unregister: (name: string) => void;
      }>('JobRegistry');

      jobRegistry.register('test-failing', async () => {
        throw new Error('boom');
      });
      jobRegistry.register('test-ok', async () => undefined);

      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/internal/jobs/run')
          .set('X-Jobs-Key', process.env.JOBS_KEY ?? 'test-jobs-key')
          .expect(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.ran).toBe(2);
        expect(res.body.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'test-failing', ok: false }),
            expect.objectContaining({ name: 'test-ok', ok: true }),
          ]),
        );
      } finally {
        jobRegistry.unregister('test-failing');
        jobRegistry.unregister('test-ok');
      }
    });
  });

  describe('error envelope', () => {
    it('maps an unknown ObjectId to 400 INVALID_ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/probe/docs/not-an-object-id')
        .expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'INVALID_ID',
      });
      expect(typeof res.body.message).toBe('string');
    });

    it('returns a typed 404 body for a valid-but-missing id', async () => {
      const validId = '64b000000000000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/probe/docs/${validId}`)
        .expect(404);
      expect(res.body.statusCode).toBe(404);
      expect(typeof res.body.code).toBe('string');
    });
  });
});
