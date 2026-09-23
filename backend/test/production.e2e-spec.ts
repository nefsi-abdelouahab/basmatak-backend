import { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from './utils/memory-connection';

/** Captures every log line the Nest app emits so none can hide a secret. */
class CollectingLogger implements LoggerService {
  readonly lines: string[] = [];
  private push(message: unknown, ...optionalParams: unknown[]) {
    for (const part of [message, ...optionalParams]) {
      if (part !== undefined && part !== null) {
        this.lines.push(String(part));
      }
    }
  }
  log(message: unknown, ...optionalParams: unknown[]) {
    this.push(message, ...optionalParams);
  }
  error(message: unknown, ...optionalParams: unknown[]) {
    this.push(message, ...optionalParams);
  }
  warn(message: unknown, ...optionalParams: unknown[]) {
    this.push(message, ...optionalParams);
  }
  debug(message: unknown, ...optionalParams: unknown[]) {
    this.push(message, ...optionalParams);
  }
  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.push(message, ...optionalParams);
  }
}

/**
 * S20 production smoke: boots the real app through `configureApp` (the same
 * main.ts wiring) with NODE_ENV=production, sentinel secrets, a collecting
 * logger and SWAGGER_ENABLED=true. Asserts the app stays healthy (health
 * endpoint reachable), leaks no secret into the response/headers/boot logs,
 * and keeps the production posture (Swagger hidden, strict CSP).
 */
describe('production boot (S20)', () => {
  const SENTINELS = {
    JWT_ACCESS_SECRET: 'deploy-sentinel-access-secret-0x1',
    JWT_REFRESH_SECRET: 'deploy-sentinel-refresh-secret-0x2',
    JOBS_KEY: 'deploy-sentinel-jobs-key-0x3',
    MONGO_DB: 'deploy-sentinel-mongo-uri-0x4',
    MAIL_PASS: 'deploy-sentinel-mail-pass-0x5',
    SUPABASE_SERVICE_ROLE_KEY: 'deploy-sentinel-supabase-0x6',
    SUPABASE_URL: 'https://deploy-sentinel-project.supabase.co',
  };

  let memory: MemoryConnectionHandle;
  let app: INestApplication | undefined;
  let capture: CollectingLogger;

  beforeAll(async () => {
    memory = await startMemoryConnection();
    process.env.MONGO_URI = memory.mongod.getUri('basmatak-test');
    process.env.NODE_ENV = 'production';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.PUBLIC_BASE_URL = 'https://basmatak-backend.onrender.com';
    for (const [key, value] of Object.entries(SENTINELS)) {
      process.env[key] = value;
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

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    capture = new CollectingLogger();
    const booted = configureApp(
      moduleRef.createNestApplication({ logger: capture }),
    );
    await booted.init();
    app = booted;
    return booted;
  }

  it('stays healthy in production and answers the Render health probe', async () => {
    await boot();
    const res = await request(app!.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
  });

  it('leaks no secret into the health response, headers or boot logs', async () => {
    await boot();
    const res = await request(app!.getHttpServer()).get('/api/v1/health');
    const bodyText = JSON.stringify(res.body);
    const headerText = JSON.stringify(res.headers);
    const logText = capture.lines.join('\n');

    for (const value of Object.values(SENTINELS)) {
      expect(bodyText).not.toContain(value);
      expect(headerText).not.toContain(value);
      expect(logText).not.toContain(value);
    }
  });

  it('hides Swagger in production even when SWAGGER_ENABLED=true', async () => {
    await boot();
    await request(app!.getHttpServer()).get('/api/docs').expect(404);
  });

  it('serves the strict production CSP (no third-party origins)', async () => {
    await boot();
    const health = await request(app!.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const csp = health.headers['content-security-policy'] as string;
    expect(csp).not.toContain('cdn.jsdelivr.net');
    expect(csp).toContain("script-src 'self'");
    expect(health.headers['x-content-type-options']).toBe('nosniff');
  });
});
