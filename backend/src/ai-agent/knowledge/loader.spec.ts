import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { KnowledgeLoadResult } from './knowledge.types';
import {
  MAX_FILE_BYTES,
  MAX_INDEXED_FILES,
  MAX_TOTAL_BYTES,
  loadKnowledge,
  resolveKnowledgeRoot,
} from './loader';

const VALID_ROOT = path.join(__dirname, '__fixtures__', 'valid');
const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basmatak-knowledge-'));
  tempRoots.push(root);
  return root;
}

function writeFixture(
  root: string,
  relativePath: string,
  content: string | Buffer,
): void {
  const fullPath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function codes(result: KnowledgeLoadResult): string[] {
  return result.issues.map((issue) => issue.code);
}

function canCreateSymlinks(): boolean {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'basmatak-symlink-check-'),
  );
  try {
    const target = path.join(root, 'target.txt');
    fs.writeFileSync(target, 'target');
    fs.symlinkSync(target, path.join(root, 'link.txt'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const SYMLINKS_SUPPORTED = canCreateSymlinks();

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('KnowledgeLoader', () => {
  it('loads the valid fixture corpus deterministically with metadata', () => {
    const result = loadKnowledge(VALID_ROOT);

    expect(result.issues).toEqual([]);
    expect(result.filesScanned).toBe(10);
    expect(result.indexedFiles).toBe(10);
    expect(result.documents.map((document) => document.source)).toEqual([
      'empty.md',
      'fallback.md',
      'glossary.csv',
      'guide-block-tags.md',
      'guide.en.md',
      'metadata.json',
      'nested/ar/guide.md',
      'notes.txt',
      'strings.json',
      'topics.json',
    ]);

    const expectedBytes = result.documents.reduce(
      (total, document) =>
        total +
        fs.statSync(path.join(VALID_ROOT, ...document.source.split('/'))).size,
      0,
    );
    expect(result.totalBytes).toBe(expectedBytes);

    const guide = result.documents.find(
      (document) => document.source === 'guide.en.md',
    );
    expect(guide?.title).toBe('Volunteer guide');
    expect(guide?.locale).toBe('en');
    expect(guide?.tags).toEqual(['volunteering', 'applications']);
    expect(guide?.priority).toBe(2);
    expect(guide?.blocks.length).toBeGreaterThan(0);

    const arabic = result.documents.find(
      (document) => document.source === 'nested/ar/guide.md',
    );
    expect(arabic?.locale).toBe('ar');
    expect(arabic?.title).toBe('دليل المتطوع');

    const empty = result.documents.find(
      (document) => document.source === 'empty.md',
    );
    expect(empty?.text).toBe('');
    expect(empty?.blocks).toEqual([]);
  });

  it('ignores README, hidden entries, underscore directories, and dependency folders', () => {
    const root = makeTempRoot();
    writeFixture(root, 'keep.md', '# Keep\n\nBody.');
    writeFixture(root, 'README.md', '# Readme\n\nBody.');
    writeFixture(root, 'readme.md', '# Lowercase readme\n\nBody.');
    writeFixture(root, '.hidden.md', '# Hidden\n\nBody.');
    writeFixture(root, '.env', 'AI_AGENT_KNOWLEDGE_DIR=ignored');
    writeFixture(root, '_config/synonyms.json', '{"groups":[]}');
    writeFixture(root, 'node_modules/pkg.md', '# Package\n\nBody.');
    writeFixture(root, 'dist/out.md', '# Output\n\nBody.');
    writeFixture(root, 'image.png', 'not an image');

    const result = loadKnowledge(root);

    expect(result.documents.map((document) => document.source)).toEqual([
      'keep.md',
    ]);
    expect(result.filesScanned).toBe(2);
    expect(result.indexedFiles).toBe(1);
    expect(codes(result)).toContain('UNSUPPORTED_EXTENSION');
  });

  (SYMLINKS_SUPPORTED ? it : it.skip)(
    'rejects symlinks instead of following them outside the root',
    () => {
      const root = makeTempRoot();
      const outside = makeTempRoot();
      writeFixture(root, 'keep.md', '# Keep\n\nBody.');
      writeFixture(outside, 'secret.md', '# Secret\n\nOutside.');

      fs.symlinkSync(
        path.join(outside, 'secret.md'),
        path.join(root, 'linked.md'),
        'file',
      );

      const result = loadKnowledge(root);

      expect(result.documents.map((document) => document.source)).toEqual([
        'keep.md',
      ]);
      expect(codes(result)).toContain('SYMLINK_NOT_ALLOWED');
    },
  );

  (SYMLINKS_SUPPORTED ? it : it.skip)('rejects a symlinked root', () => {
    const root = makeTempRoot();
    const link = path.join(makeTempRoot(), 'linked-root');

    fs.symlinkSync(root, link, 'dir');

    const result = loadKnowledge(link);

    expect(result.documents).toEqual([]);
    expect(codes(result)).toContain('ROOT_SYMLINK');
  });

  it('rejects invalid UTF-8', () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, 'bad.md'),
      Buffer.from([0xff, 0xfe, 0x00, 0x41]),
    );

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(result.filesScanned).toBe(1);
    expect(codes(result)).toContain('INVALID_UTF8');
  });

  it('strips a leading UTF-8 BOM before parsing', () => {
    const root = makeTempRoot();
    writeFixture(root, 'bom.md', '\uFEFF# BOM title\n\nBody.');

    const result = loadKnowledge(root);

    expect(result.issues).toEqual([]);
    expect(result.documents[0].title).toBe('BOM title');
  });

  it('rejects files above the per-file size limit', () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, 'large.md'),
      'a'.repeat(MAX_FILE_BYTES + 1),
    );

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(result.totalBytes).toBe(0);
    expect(codes(result)).toContain('FILE_TOO_LARGE');
  });

  it('fails closed when the corpus exceeds the total size limit', () => {
    const root = makeTempRoot();
    const chunk = 'a'.repeat(900 * 1024);
    for (let index = 0; index < 6; index += 1) {
      fs.writeFileSync(path.join(root, `file-${index}.md`), chunk);
    }

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(result.filesScanned).toBe(6);
    expect(codes(result)).toContain('TOTAL_SIZE_EXCEEDED');
    expect(6 * 900 * 1024).toBeGreaterThan(MAX_TOTAL_BYTES);
  });

  it('fails closed when the corpus exceeds the file-count limit', () => {
    const root = makeTempRoot();
    for (let index = 0; index < MAX_INDEXED_FILES + 1; index += 1) {
      fs.writeFileSync(
        path.join(root, `file-${String(index).padStart(3, '0')}.md`),
        '# Doc\n\nBody.',
      );
    }

    const result = loadKnowledge(root);
    const limitIssue = result.issues.find(
      (issue) => issue.code === 'TOO_MANY_FILES',
    );

    expect(result.documents).toEqual([]);
    expect(result.filesScanned).toBe(MAX_INDEXED_FILES + 1);
    expect(limitIssue?.message).toContain(String(MAX_INDEXED_FILES + 1));
    expect(limitIssue?.message).toContain(String(MAX_INDEXED_FILES));
  });

  it('excludes one bad file without failing the whole scan', () => {
    const root = makeTempRoot();
    writeFixture(root, 'good.md', '# Good\n\nBody.');
    writeFixture(root, 'bad.json', '{ "title": "Broken", ');
    writeFixture(root, 'bad.csv', 'a,b\n1,"unterminated');

    const result = loadKnowledge(root);

    expect(result.documents.map((document) => document.source)).toEqual([
      'good.md',
    ]);
    expect(result.indexedFiles).toBe(1);
    expect(result.filesScanned).toBe(3);
    expect(codes(result)).toEqual(
      expect.arrayContaining(['INVALID_JSON', 'INVALID_CSV']),
    );
  });

  it('rejects safety violations without leaking file contents', () => {
    const root = makeTempRoot();
    writeFixture(
      root,
      'email.md',
      '# Contact\n\nReach us at person@example.com.',
    );
    writeFixture(
      root,
      'placeholder.md',
      '# Draft\n\nTODO: finish this section.',
    );

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(codes(result)).toContain('EMAIL_PATTERN');
    expect(codes(result)).toContain('FORBIDDEN_CONTENT');
    for (const issue of result.issues) {
      expect(issue.message).not.toContain('person@example.com');
      expect(issue.message).not.toContain('finish this section');
    }
  });

  it('accepts the official contact details in the four allowlisted files', () => {
    const root = makeTempRoot();
    const allowlisted = [
      '01-about/contact/en.md',
      '01-about/contact/ar.md',
      '08-faq/troubleshooting/en.md',
      '08-faq/troubleshooting/ar.md',
    ];

    allowlisted.forEach((file, index) => {
      writeFixture(
        root,
        file,
        `# Official contact ${index}\n\nEmail roeyatimimoun@gmail.com or call +213 663847105 or +213 663 847 105.`,
      );
    });

    const result = loadKnowledge(root);

    expect(result.issues).toEqual([]);
    expect(result.documents).toHaveLength(4);
  });

  it('rejects a different email or phone in an allowlisted file', () => {
    const root = makeTempRoot();
    const allowlisted = [
      '01-about/contact/en.md',
      '01-about/contact/ar.md',
      '08-faq/troubleshooting/en.md',
      '08-faq/troubleshooting/ar.md',
    ];

    allowlisted.forEach((file, index) => {
      writeFixture(
        root,
        file,
        `# Different contact ${index}\n\nEmail person@example.test or call +213 555 555 555.`,
      );
    });

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(
      result.issues.filter((issue) => issue.code === 'EMAIL_PATTERN'),
    ).toHaveLength(4);
    expect(
      result.issues.filter((issue) => issue.code === 'PHONE_PATTERN'),
    ).toHaveLength(4);
  });

  it('rejects official contact details outside the allowlist', () => {
    const root = makeTempRoot();
    writeFixture(
      root,
      '08-faq/contact-elsewhere/en.md',
      '# Contact elsewhere\n\nEmail roeyatimimoun@gmail.com or call +213 663847105.',
    );

    const result = loadKnowledge(root);

    expect(result.documents).toEqual([]);
    expect(codes(result)).toContain('EMAIL_PATTERN');
    expect(codes(result)).toContain('PHONE_PATTERN');
  });

  it('returns a clear issue for a missing root or a non-directory root', () => {
    const missingRoot = path.join(makeTempRoot(), 'missing');

    const missing = loadKnowledge(missingRoot);
    expect(missing.documents).toEqual([]);
    expect(missing.filesScanned).toBe(0);
    expect(codes(missing)).toContain('ROOT_NOT_FOUND');

    const root = makeTempRoot();
    const filePath = path.join(root, 'file.md');
    fs.writeFileSync(filePath, '# File');

    const notDirectory = loadKnowledge(filePath);
    expect(notDirectory.documents).toEqual([]);
    expect(codes(notDirectory)).toContain('ROOT_NOT_DIRECTORY');
  });

  it('resolves an explicit root before the environment and cwd fallback', () => {
    const original = process.env.AI_AGENT_KNOWLEDGE_DIR;

    try {
      delete process.env.AI_AGENT_KNOWLEDGE_DIR;
      expect(resolveKnowledgeRoot('explicit')).toBe(path.resolve('explicit'));

      process.env.AI_AGENT_KNOWLEDGE_DIR = 'from-env';
      expect(resolveKnowledgeRoot()).toBe(path.resolve('from-env'));
      expect(resolveKnowledgeRoot('')).toBe(path.resolve('from-env'));
      expect(resolveKnowledgeRoot('explicit')).toBe(path.resolve('explicit'));
    } finally {
      if (original === undefined) {
        delete process.env.AI_AGENT_KNOWLEDGE_DIR;
      } else {
        process.env.AI_AGENT_KNOWLEDGE_DIR = original;
      }
    }
  });

  it('loads an explicit root even when the environment points elsewhere', () => {
    const explicit = makeTempRoot();
    const other = makeTempRoot();
    writeFixture(explicit, 'explicit.md', '# Explicit\n\nBody.');
    writeFixture(other, 'other.md', '# Other\n\nBody.');

    const original = process.env.AI_AGENT_KNOWLEDGE_DIR;
    process.env.AI_AGENT_KNOWLEDGE_DIR = other;

    try {
      const result = loadKnowledge(explicit);
      expect(result.documents.map((document) => document.source)).toEqual([
        'explicit.md',
      ]);
    } finally {
      if (original === undefined) {
        delete process.env.AI_AGENT_KNOWLEDGE_DIR;
      } else {
        process.env.AI_AGENT_KNOWLEDGE_DIR = original;
      }
    }
  });

  it('loads the committed corpus without issues', () => {
    const corpus = path.resolve(__dirname, '../../../ai-agent');
    if (!fs.existsSync(corpus)) return;

    const result = loadKnowledge(corpus);

    expect(result.issues).toEqual([]);
    expect(result.documents).toHaveLength(138);
    expect(result.documents.map((document) => document.source)).toEqual(
      expect.arrayContaining([
        '01-about/contact/en.md',
        '01-about/contact/ar.md',
        '08-faq/troubleshooting/en.md',
        '08-faq/troubleshooting/ar.md',
        '02-concepts/organization-reliability/en.md',
        '02-concepts/reviews-and-ratings/ar.md',
        '03-user-roles/account-and-sessions/en.md',
        '04-workflow/opportunity-statuses/en.md',
        '04-workflow/status-reference/ar.md',
        '04-workflow/media-and-evidence-limits/en.md',
        '05-pages-and-features/notification-types/en.md',
        '05-pages-and-features/portfolio/ar.md',
        '07-privacy-and-trust/volunteer-public-settings/en.md',
        '07-privacy-and-trust/account-deletion/ar.md',
        'data/glossary.csv',
        'data/topics.json',
      ]),
    );
    expect(result.documents.map((document) => document.source)).not.toContain(
      'README.md',
    );
    expect(result.documents.map((document) => document.source)).not.toContain(
      '_config/synonyms.json',
    );
    expect(result.documents.map((document) => document.source)).not.toContain(
      'faq/en.md',
    );
    expect(result.documents.map((document) => document.source)).not.toContain(
      'guides/en.md',
    );
    expect(result.documents.map((document) => document.source)).not.toContain(
      'policies/en.md',
    );
  });
});
