import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppLogger } from '../../common/logger/app.logger';
import {
  AiAgentConfig,
  AiAgentLimits,
  defaultAiAgentConfig,
} from '../config/ai-agent.config';
import { KnowledgeChunker } from './chunker';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeLoader } from './loader';
import { KnowledgeNormalizer } from './normalizer';

const tempRoots: string[] = [];

interface LoggerStub {
  logger: AppLogger;
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
}

function makeLogger(): LoggerStub {
  const log = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  return {
    logger: { log, warn, error } as unknown as AppLogger,
    log,
    warn,
    error,
  };
}

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basmatak-service-'));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function makeConfig(
  root: string,
  limits: Partial<AiAgentLimits> = {},
): AiAgentConfig {
  const base = defaultAiAgentConfig();
  return {
    ...base,
    knowledgeDir: root,
    limits: { ...base.limits, ...limits },
  };
}

function makeService(
  root: string,
  logger: LoggerStub,
  limits: Partial<AiAgentLimits> = {},
): KnowledgeService {
  return new KnowledgeService(
    new KnowledgeLoader(root),
    new KnowledgeChunker(),
    new KnowledgeNormalizer(),
    makeConfig(root, limits),
    logger.logger,
  );
}

function warningPayloads(logger: LoggerStub): Array<Record<string, unknown>> {
  return logger.warn.mock.calls.map((call) => {
    try {
      return JSON.parse(String(call[0])) as Record<string, unknown>;
    } catch {
      return {};
    }
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('KnowledgeService', () => {
  it('loads, chunks, indexes, and searches the corpus at boot', () => {
    const root = makeRoot();
    writeFile(
      root,
      'faq/en.md',
      [
        '---',
        'title: Basmatak FAQ',
        'locale: en',
        'tags: [platform, volunteers]',
        'priority: 1',
        '---',
        '',
        '# Basmatak FAQ',
        '',
        '## What is Basmatak?',
        '',
        'Basmatak connects volunteers with volunteering opportunities.',
        '',
        '## How do I apply?',
        '',
        'Open an opportunity and apply before the deadline.',
        '',
      ].join('\n'),
    );
    const logger = makeLogger();
    const service = makeService(root, logger);

    service.onModuleInit();

    expect(service.getCounts()).toEqual({ files: 1, chunks: 2 });
    const counts = service.getCounts();
    counts.files = 99;
    expect(service.getCounts().files).toBe(1);

    const result = service.search('Basmatak volunteers', 'en', { topK: 2 });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]).toMatchObject({
      source: 'faq/en.md',
      title: 'Basmatak FAQ',
      locale: 'en',
    });
    expect(result.chunks[0].text).toContain('Basmatak');
    expect(result.chunks[0]).not.toHaveProperty('document');

    const ready = logger.log.mock.calls
      .map((call) => {
        try {
          return JSON.parse(String(call[0])) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .find((payload) => payload.event === 'ai_agent_knowledge_ready');
    expect(ready).toMatchObject({ files: 1, chunks: 2 });
  });

  it('matches Arabic hamza, clitic, and digit variants through search', () => {
    const root = makeRoot();
    writeFile(
      root,
      'faq/ar.md',
      [
        '---',
        'title: أسئلة المنصة',
        'locale: ar',
        'priority: 1',
        '---',
        '',
        '# أسئلة المنصة',
        '',
        '## الهاكاثون',
        '',
        'طُوّرت بصمتك تطوع في الجزائر عام 2026.',
        '',
        '## التسجيل',
        '',
        'التسجيل متاح للمتطوعين والمنظمات.',
        '',
      ].join('\n'),
    );
    const service = makeService(root, makeLogger());

    service.onModuleInit();

    expect(service.search('الجزاير', 'ar').chunks.length).toBeGreaterThan(0);
    expect(service.search('٢٠٢٦', 'ar').chunks.length).toBeGreaterThan(0);
    expect(service.search('والتسجيل', 'ar').chunks.length).toBeGreaterThan(0);
  });

  it('keeps an empty safe index when the corpus is missing', () => {
    const root = path.join(makeRoot(), 'missing');
    const logger = makeLogger();
    const service = makeService(root, logger);

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getCounts()).toEqual({ files: 0, chunks: 0 });
    expect(service.search('anything')).toEqual({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'EMPTY_CORPUS',
    });

    const warnings = warningPayloads(logger);
    expect(warnings.length).toBeGreaterThan(0);
    expect(
      warnings.some((payload) => payload.event === 'ai_agent_knowledge_empty'),
    ).toBe(true);
    const serialized = JSON.stringify(warnings);
    expect(serialized).not.toContain('anything');
    expect(serialized).not.toContain('missing');
  });

  it('indexes valid documents and logs issue counts/codes without content', () => {
    const root = makeRoot();
    writeFile(
      root,
      'faq/en.md',
      [
        '---',
        'title: Safe FAQ',
        'locale: en',
        'tags: [platform]',
        'priority: 1',
        '---',
        '',
        '# Safe FAQ',
        '',
        '## What is Basmatak?',
        '',
        'A safe answer about volunteering.',
        '',
      ].join('\n'),
    );
    writeFile(
      root,
      'faq/bad.md',
      '# Unsafe\n\nThis file contains TODO placeholder content.\n',
    );
    const logger = makeLogger();
    const service = makeService(root, logger);

    service.onModuleInit();

    expect(service.getCounts()).toEqual({ files: 1, chunks: 1 });
    expect(service.search('volunteering').chunks).toHaveLength(1);

    const warnings = warningPayloads(logger);
    const issueWarning = warnings.find(
      (payload) => payload.event === 'ai_agent_knowledge_issues',
    );
    expect(issueWarning).toMatchObject({
      files: 1,
      issues: 1,
      codes: ['FORBIDDEN_CONTENT'],
    });

    const serialized = JSON.stringify(warnings);
    expect(serialized).not.toContain('TODO');
    expect(serialized).not.toContain('bad.md');
    expect(serialized).not.toContain('Safe answer');
  });

  it('applies the configured chunk cap to searches', () => {
    const root = makeRoot();
    for (const [index, source] of ['a.md', 'b.md', 'c.md'].entries()) {
      writeFile(
        root,
        source,
        [
          '---',
          `title: Doc ${index + 1}`,
          'locale: en',
          'tags: [platform]',
          'priority: 3',
          '---',
          '',
          `# Doc ${index + 1}`,
          '',
          `## Section ${index + 1}`,
          '',
          'Volunteer opportunity information for everyone.',
          '',
        ].join('\n'),
      );
    }
    const logger = makeLogger();
    const service = makeService(root, logger, { maxKnowledgeChunks: 2 });

    service.onModuleInit();
    const result = service.search('volunteer opportunity', 'en');

    expect(result.chunks).toHaveLength(2);
  });

  it('turns a loader failure into an empty index without exposing details', () => {
    const root = makeRoot();
    const logger = makeLogger();
    const loader = {
      load: () => {
        throw new Error('secret file content should never be logged');
      },
    } as unknown as KnowledgeLoader;
    const config = makeConfig(root);
    const service = new KnowledgeService(
      loader,
      new KnowledgeChunker(),
      new KnowledgeNormalizer(),
      config,
      logger.logger,
    );

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getCounts()).toEqual({ files: 0, chunks: 0 });

    const warnings = warningPayloads(logger);
    expect(warnings[0].event).toBe('ai_agent_knowledge_load_failed');
    expect(JSON.stringify(warnings)).not.toContain('secret file content');
  });
});
