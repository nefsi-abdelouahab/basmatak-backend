import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { configureApp } from '../../main';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../../test/utils/memory-connection';

/**
 * S19 secret hygiene: two guards.
 * 1. Static: no source/test line may hand `process.env` values straight into a
 *    logger/console call (the classic secret-in-log footgun). Coarse by design
 *    (line-level, catches the direct class) and locks the trend.
 * 2. Boot-time: booting the real app with sentinel secrets must not echo any
 *    of them into a capturing logger.
 */
describe('secret hygiene (S19)', () => {
  const BACKEND = join(__dirname, '..', '..', '..');
  const ROOTS = [join(BACKEND, 'src'), join(BACKEND, 'test')];
  const LOG_TOKENS = [
    'console.',
    'Logger.',
    'logger.',
    '.log(',
    '.warn(',
    '.error(',
    '.info(',
    '.debug(',
    '.verbose(',
    'process.stdout.write',
    'process.stderr.write',
  ];

  function collectFiles(dir: string, acc: string[]): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        collectFiles(full, acc);
      } else if (entry.endsWith('.ts')) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('never passes process.env values directly into log output', () => {
    const files = ROOTS.flatMap((root) => collectFiles(root, []));
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!line.includes('process.env')) {
          return;
        }
        const logging = LOG_TOKENS.some((token) => line.includes(token));
        if (logging) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('does not echo secrets into logs while booting the app', async () => {
    const memory: MemoryConnectionHandle = await startMemoryConnection();
    const captured: string[] = [];
    const collector = {
      log: (...args: unknown[]) => captured.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => captured.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => captured.push(args.map(String).join(' ')),
      debug: (...args: unknown[]) => captured.push(args.map(String).join(' ')),
      verbose: (...args: unknown[]) =>
        captured.push(args.map(String).join(' ')),
    };
    const envBackup = new Map<string, string | undefined>();
    const applyEnv = (key: string, value: string) => {
      envBackup.set(key, process.env[key]);
      process.env[key] = value;
    };
    const restoreEnv = () => {
      for (const [key, value] of envBackup) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };

    applyEnv('MONGO_URI', memory.mongod.getUri('basmatak-test'));
    applyEnv('JWT_ACCESS_SECRET', 's19-sentinel-access-9f8e7d6c');
    applyEnv('JWT_REFRESH_SECRET', 's19-sentinel-refresh-1a2b3c4d');
    applyEnv('JOBS_KEY', 's19-sentinel-jobs-7u8i9o0p');
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const app = configureApp(
        moduleRef.createNestApplication({ logger: collector }),
      );
      await app.init();
      await app.close();
    } finally {
      restoreEnv();
      await stopMemoryConnection(memory);
    }

    const emitted = captured.join('\n');
    expect(emitted).not.toContain('s19-sentinel-access-9f8e7d6c');
    expect(emitted).not.toContain('s19-sentinel-refresh-1a2b3c4d');
    expect(emitted).not.toContain('s19-sentinel-jobs-7u8i9o0p');
  });
});
