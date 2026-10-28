import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { CheckResult, MAX_INDEXED_FILES, checkKnowledge } from './ai-check';

describe('ai-check knowledge corpus validation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'basmatak-ai-check-'));
  });

  afterEach(() => {
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    });
  });

  const writeFile = (relative: string, content: string | Buffer): string => {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    return full;
  };

  const frontMatter = (
    title: string,
    locale = 'en',
    tags = '[test]',
    priority = '1',
  ): string =>
    `---\ntitle: ${title}\nlocale: ${locale}\ntags: ${tags}\npriority: ${priority}\n---\n`;

  const markdown = (title: string, locale = 'en', body = 'Content.'): string =>
    `${frontMatter(title, locale)}\n# ${title}\n\n${body}\n`;

  const codes = (result: CheckResult): string[] =>
    result.errors.map((error) => error.code);

  it('accepts valid Markdown, TXT, JSON, and CSV', () => {
    writeFile('faq/en.md', markdown('English FAQ', 'en'));
    writeFile('faq/ar.md', markdown('Arabic FAQ', 'ar'));
    writeFile(
      'data/notes.en.txt',
      `${frontMatter('English notes', 'en')}\nPlain text notes.\n`,
    );
    writeFile(
      'data/notes.ar.txt',
      `${frontMatter('Arabic notes', 'ar')}\nملاحظات نصية.\n`,
    );
    writeFile(
      'data/topics.json',
      JSON.stringify([{ id: 'one', title_en: 'One', title_ar: 'واحد' }]),
    );
    writeFile('data/glossary.csv', 'term_en,term_ar\nopportunity,فرصة\n');

    const result = checkKnowledge(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.filesScanned).toBe(6);
    expect(result.indexedFiles).toBe(6);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('ignores README, _config, hidden files, and ignored directories', () => {
    writeFile('faq/en.md', markdown('English FAQ', 'en'));
    writeFile('faq/ar.md', markdown('Arabic FAQ', 'ar'));
    writeFile('README.md', 'TODO\n');
    writeFile('_config/synonyms.json', '{ not valid json');
    writeFile('.env', 'GEMINI_API_KEY=value');
    writeFile('.hidden/bad.md', 'TODO');
    writeFile('node_modules/bad.md', 'TODO');
    writeFile('dist/bad.md', 'TODO');

    const result = checkKnowledge(root);

    expect(result.errors).toEqual([]);
    expect(result.filesScanned).toBe(2);
    expect(result.indexedFiles).toBe(2);
  });

  it('rejects unsupported extensions', () => {
    writeFile('data/notes.pdf', 'plain text');

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('UNSUPPORTED_EXTENSION');
    expect(result.filesScanned).toBe(1);
    expect(result.indexedFiles).toBe(0);
  });

  it('rejects files over 1 MB', () => {
    writeFile('big.en.md', Buffer.alloc(1024 * 1024 + 1, 'a'));

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('FILE_TOO_LARGE');
    expect(result.indexedFiles).toBe(1);
  });

  it('rejects invalid UTF-8', () => {
    writeFile('bad.en.md', Buffer.from([0xc3, 0x28]));

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('INVALID_UTF8');
  });

  it('rejects duplicate titles after normalization', () => {
    writeFile('one/en.md', markdown('Same Topic', 'en'));
    writeFile('two/en.md', markdown('  same   topic  ', 'en'));

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('DUPLICATE_TITLE');
  });

  it('rejects malformed and invalid front matter', () => {
    writeFile('bad/malformed.en.md', '---\ntitle: Missing close\n\n# Body\n');
    writeFile('bad/locale.en.md', markdown('Locale topic', 'de'));
    writeFile(
      'bad/tags.en.md',
      `${frontMatter('Tags topic', 'en', 'not-an-array')}\nBody.\n`,
    );
    writeFile(
      'bad/priority.en.md',
      `${frontMatter('Priority topic', 'en', '[test]', '9')}\nBody.\n`,
    );
    writeFile('bad/missing.en.md', '---\ntitle: Missing keys\n---\n\nBody.\n');
    writeFile(
      'bad/line.en.md',
      '---\ntitle: Line topic\nlocale: en\ntags: [test]\npriority: 1\nnot yaml\n---\n',
    );

    const result = checkKnowledge(root);

    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'MALFORMED_FRONT_MATTER',
        'INVALID_LOCALE',
        'INVALID_TAGS',
        'INVALID_PRIORITY',
        'INVALID_FRONT_MATTER',
      ]),
    );
  });

  it('rejects secret-like content without echoing values', () => {
    const googleKey = `AIza${'x'.repeat(24)}`;
    const apiKey = `sk-${'y'.repeat(24)}`;
    const keyHeader = `-----BEGIN ${'PRIVATE KEY-----'}`;
    const mongoUri = `mongodb://${'user:pass@example.test/db'}`;
    const envName = 'GEMINI_API_KEY';

    writeFile(
      'secrets/google.en.md',
      markdown('Google pattern', 'en', googleKey),
    );
    writeFile('secrets/api.en.md', markdown('API pattern', 'en', apiKey));
    writeFile('secrets/key.en.md', markdown('Key pattern', 'en', keyHeader));
    writeFile('secrets/mongo.en.md', markdown('Mongo pattern', 'en', mongoUri));
    writeFile('secrets/env.en.md', markdown('Env pattern', 'en', envName));

    const result = checkKnowledge(root);
    const secretErrors = result.errors.filter(
      (error) => error.code === 'SECRET_PATTERN',
    );

    expect(secretErrors.length).toBeGreaterThanOrEqual(5);
    for (const value of [googleKey, apiKey, keyHeader, mongoUri, envName]) {
      for (const issue of result.errors) {
        expect(issue.message).not.toContain(value);
      }
    }
  });

  it('rejects email and phone-number patterns', () => {
    writeFile(
      'contact/email.en.md',
      markdown(
        'Email topic',
        'en',
        'Write to person@example.test for details.',
      ),
    );
    writeFile(
      'contact/phone.en.md',
      markdown('Phone topic', 'en', 'Call +213 000 000 000.'),
    );

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('EMAIL_PATTERN');
    expect(codes(result)).toContain('PHONE_PATTERN');
  });

  it('accepts the official contact details in the four allowlisted files', () => {
    const allowlisted = [
      ['01-about/contact/en.md', 'en'],
      ['01-about/contact/ar.md', 'ar'],
      ['08-faq/troubleshooting/en.md', 'en'],
      ['08-faq/troubleshooting/ar.md', 'ar'],
    ] as const;

    allowlisted.forEach(([file, locale], index) => {
      writeFile(
        file,
        markdown(
          `Official contact ${index}`,
          locale,
          'Email roeyatimimoun@gmail.com or call +213 663847105 or +213 663 847 105.',
        ),
      );
    });

    const result = checkKnowledge(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a different email or phone in an allowlisted file', () => {
    const allowlisted = [
      '01-about/contact/en.md',
      '01-about/contact/ar.md',
      '08-faq/troubleshooting/en.md',
      '08-faq/troubleshooting/ar.md',
    ];

    allowlisted.forEach((file, index) => {
      writeFile(
        file,
        markdown(
          `Different contact ${index}`,
          'en',
          'Email person@example.test or call +213 555 555 555.',
        ),
      );
    });

    const result = checkKnowledge(root);

    expect(
      result.errors.filter((error) => error.code === 'EMAIL_PATTERN'),
    ).toHaveLength(4);
    expect(
      result.errors.filter((error) => error.code === 'PHONE_PATTERN'),
    ).toHaveLength(4);
  });

  it('rejects official contact details outside the allowlist', () => {
    writeFile(
      '08-faq/contact-elsewhere/en.md',
      markdown(
        'Contact elsewhere',
        'en',
        'Email roeyatimimoun@gmail.com or call +213 663847105.',
      ),
    );

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('EMAIL_PATTERN');
    expect(codes(result)).toContain('PHONE_PATTERN');
  });

  it('rejects placeholder markers and script-like content', () => {
    writeFile(
      'placeholder/all.en.md',
      markdown(
        'Placeholder topic',
        'en',
        'TODO TBD FIXME lorem ipsum <script> javascript:',
      ),
    );

    const result = checkKnowledge(root);
    const forbidden = result.errors.filter(
      (error) => error.code === 'FORBIDDEN_CONTENT',
    );

    expect(forbidden).toHaveLength(6);
  });

  it('rejects CSV formula injection in any cell', () => {
    writeFile(
      'data/bad.csv',
      'term,definition\n=SUM(A1:A2),x\n+cmd,x\n-1,x\n@user,x\n',
    );

    const result = checkKnowledge(root);
    const formulas = result.errors.filter(
      (error) => error.code === 'CSV_FORMULA_INJECTION',
    );

    expect(formulas).toHaveLength(4);
  });

  it('rejects JSON nesting deeper than 10 levels', () => {
    let deep: unknown = 'leaf';
    for (let index = 0; index < 11; index += 1) deep = [deep];
    writeFile('data/deep.json', JSON.stringify(deep));

    let allowed: unknown = 'leaf';
    for (let index = 0; index < 10; index += 1) allowed = [allowed];
    writeFile('data/allowed.json', JSON.stringify(allowed));

    const result = checkKnowledge(root);
    const depthErrors = result.errors.filter(
      (error) => error.code === 'JSON_TOO_DEEP',
    );

    expect(depthErrors).toHaveLength(1);
    expect(depthErrors[0].file).toContain('deep.json');
  });

  it('rejects invalid JSON', () => {
    writeFile('data/broken.json', '{ "term": }');

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('INVALID_JSON');
  });

  it('reports a missing or non-directory root', () => {
    const missing = checkKnowledge(join(root, 'missing'));
    expect(missing.errors.map((error) => error.code)).toContain(
      'ROOT_NOT_FOUND',
    );
    expect(missing.filesScanned).toBe(0);

    const file = writeFile('not-a-directory.txt', 'x');
    const notDirectory = checkKnowledge(file);
    expect(notDirectory.errors.map((error) => error.code)).toContain(
      'ROOT_NOT_DIRECTORY',
    );
  });

  it('warns when a locale counterpart is missing', () => {
    writeFile('faq/en.md', markdown('English only', 'en'));

    const result = checkKnowledge(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('LOCALE_PAIR_MISSING');
  });

  it('rejects symlinks when the OS allows creating them', () => {
    writeFile('faq/en.md', markdown('English FAQ', 'en'));
    const target = join(root, 'faq', 'en.md');
    const link = join(root, 'faq', 'link.md');

    try {
      symlinkSync(target, link, 'file');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'UNKNOWN' ||
        code === 'ENOSYS'
      ) {
        return;
      }
      throw error;
    }

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('SYMLINK_NOT_ALLOWED');
  });

  it('enforces the indexed-file limit', () => {
    for (let index = 0; index < MAX_INDEXED_FILES + 1; index += 1) {
      writeFile(`bulk/file-${index}.en.md`, `Content ${index}.\n`);
    }

    const result = checkKnowledge(root);
    const limitError = result.errors.find(
      (error) => error.code === 'TOO_MANY_FILES',
    );

    expect(limitError).toBeDefined();
    expect(limitError?.message).toContain(String(MAX_INDEXED_FILES + 1));
    expect(limitError?.message).toContain(String(MAX_INDEXED_FILES));
    expect(result.indexedFiles).toBe(MAX_INDEXED_FILES + 1);
  });

  it('enforces the 5 MB corpus limit', () => {
    const body = 'a'.repeat(900_000);
    for (let index = 0; index < 6; index += 1) {
      writeFile(`bulk/large-${index}.en.md`, body);
    }

    const result = checkKnowledge(root);

    expect(codes(result)).toContain('TOTAL_SIZE_EXCEEDED');
    expect(result.totalBytes).toBeGreaterThan(5 * 1024 * 1024);
  });
});
