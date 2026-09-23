import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from './utils/memory-connection';

/**
 * S19: Swagger is gated off in production, and CSP is strict by default but
 * relaxed for the Swagger CDN assets when the UI is enabled. Boots real apps
 * through `configureApp` (the same wiring main.ts uses) so the header + route
 * behaviour is exercised end-to-end.
 */
describe('swagger + CSP gating (S19)', () => {
  let memory: MemoryConnectionHandle;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    memory = await startMemoryConnection();
    process.env.MONGO_URI = memory.mongod.getUri('basmatak-test');
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    if (process.env.JOBS_KEY === undefined) {
      process.env.JOBS_KEY = 'test-jobs-key';
    }
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  afterAll(async () => {
    await stopMemoryConnection(memory);
  });

  async function boot(env: Record<string, string>): Promise<INestApplication> {
    const backup: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(env)) {
      backup[key] = process.env[key];
      process.env[key] = value;
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const booted = configureApp(
      moduleRef.createNestApplication({ logger: false }),
    );
    await booted.init();
    for (const [key, value] of Object.entries(backup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return booted;
  }

  it('serves /api/docs when SWAGGER_ENABLED and relaxes CSP for the Swagger CDN', async () => {
    app = await boot({ SWAGGER_ENABLED: 'true' });

    const docs = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200);
    expect(docs.text).toContain('Swagger UI');

    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const csp = health.headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net");
    expect(csp).toContain('style-src');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
  });

  it('hides Swagger and keeps a strict default CSP in production', async () => {
    app = await boot({ SWAGGER_ENABLED: 'true', NODE_ENV: 'production' });

    const docs = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(404);
    expect(docs.body.statusCode).toBe(404);
    expect(typeof docs.body.code).toBe('string');

    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const csp = health.headers['content-security-policy'] as string;
    expect(csp).not.toContain('cdn.jsdelivr.net');
    expect(csp).toContain("script-src 'self'");
    expect(health.headers['x-content-type-options']).toBe('nosniff');
  });
});
