import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/test-db';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const handle = await createTestApp();
    app = handle.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
  });

  it('unknown route returns the error envelope with 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);
    expect(res.body.statusCode).toBe(404);
    expect(typeof res.body.code).toBe('string');
    expect(typeof res.body.message).toBe('string');
  });

  it('rejects a DTO carrying a stray unknown field (whitelist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'stray@example.com',
        password: 'Password123!',
        role: 'admin',
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.statusCode).toBe(400);
  });
});
