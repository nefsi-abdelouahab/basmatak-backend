import { Dirent, lstatSync, readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';

/**
 * Deterministic guard for the AI knowledge corpus in `backend/ai-agent/`.
 *
 * The script is intentionally independent of NestJS so it can run before a
 * build, inside CI, or from a test with a temporary directory. It never prints
 * file contents or matched values: only paths, issue codes, and short messages.
 */

export interface CheckIssue {
  file: string;
  code: string;
  message: string;
}

export interface CheckResult {
  errors: CheckIssue[];
  warnings: CheckIssue[];
  filesScanned: number;
  indexedFiles: number;
  totalBytes: number;
}

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.csv']);
const ALLOWED_LOCALES = new Set(['en', 'ar', 'fr']);
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);
export const MAX_INDEXED_FILES = 300;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 10;

const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> =
  [
    {
      pattern: /\bTODO\b/i,
      message: 'Placeholder marker TODO is not allowed.',
    },
    {
      pattern: /\bTBD\b/i,
      message: 'Placeholder marker TBD is not allowed.',
    },
    {
      pattern: /\bFIXME\b/i,
      message: 'Placeholder marker FIXME is not allowed.',
    },
    {
      pattern: /lorem ipsum/i,
      message: 'Placeholder text is not allowed.',
    },
    {
      pattern: /<script/i,
      message: 'Raw script markup is not allowed.',
    },
    {
      pattern: /javascript:/i,
      message: 'JavaScript URLs are not allowed.',
    },
  ];

const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bAIza[0-9A-Za-z_-]{10,}\b/,
    message: 'Content matches a Google-style API key pattern.',
  },
  {
    pattern: /\bsk-[0-9A-Za-z_-]{10,}\b/,
    message: 'Content matches an API key pattern.',
  },
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    message: 'Private key headers are not allowed.',
  },
  {
    pattern: /mongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s@/]+@/i,
    message: 'MongoDB connection strings with credentials are not allowed.',
  },
  {
    pattern: /\b(?:GEMINI|GROQ)_API_KEY\b/,
    message: 'Provider environment variable names are not allowed.',
  },
  {
    pattern: /\b[A-Z][A-Z0-9_]{0,63}(?:API_KEY|SECRET|PASSWORD|PRIVATE_KEY)\b/,
    message: 'Secret or credential variable names are not allowed.',
  },
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}/gi;
const ALGERIAN_PHONE_PATTERN = /\b0[2-7](?:[\s.-]?\d{2}){3,4}\b/g;
const INTERNATIONAL_PHONE_CANDIDATE =
  /(?:^|[^\w])(\+\d[\d\s().-]{6,}\d)(?!\w)/g;

/**
 * Official public contact details (the Roeya Association and platform
 * technical support) may appear only in these four files. Every other email or
 * phone number is rejected everywhere, and these files may contain only the
 * allowlisted official values.
 */
const CONTACT_GUARD_ALLOWLIST = new Set([
  '01-about/contact/ar.md',
  '01-about/contact/en.md',
  '08-faq/troubleshooting/ar.md',
  '08-faq/troubleshooting/en.md',
]);
const OFFICIAL_CONTACT_EMAILS = new Set([
  'roeyatimimoun@gmail.com',
  'a.nefsi@esi-sba.dz',
]);
const OFFICIAL_CONTACT_PHONE_DIGITS = new Set(['213663847105', '213696946808']);

interface FrontMatterValues {
  title?: string;
  locale?: string;
  tags?: string[];
  priority?: number;
}

interface FrontMatterIssue {
  code: string;
  message: string;
}

interface FrontMatterSplit {
  yaml: string | null;
  body: string;
  malformed: boolean;
}

interface FrontMatterParseResult {
  values: FrontMatterValues;
  issues: FrontMatterIssue[];
}

interface ContentIssue {
  code: string;
  message: string;
}

interface DocumentMetadata {
  title: string;
  locale?: string;
  issues: ContentIssue[];
}

/**
 * Resolve the corpus root. An explicit argument wins, then
 * `AI_AGENT_KNOWLEDGE_DIR`, then `process.cwd()/ai-agent` (the backend folder
 * on Render, so the committed corpus ships with the service).
 */
export function resolveKnowledgeRoot(rootDir?: string): string {
  const configured = process.env.AI_AGENT_KNOWLEDGE_DIR?.trim();
  const candidate =
    rootDir !== undefined && rootDir.trim() !== ''
      ? rootDir
      : configured !== undefined && configured !== ''
        ? configured
        : path.join(process.cwd(), 'ai-agent');
  return path.resolve(candidate);
}

export function checkKnowledge(rootDir?: string): CheckResult {
  const root = resolveKnowledgeRoot(rootDir);
  const result: CheckResult = {
    errors: [],
    warnings: [],
    filesScanned: 0,
    indexedFiles: 0,
    totalBytes: 0,
  };

  let rootStat: ReturnType<typeof statSync> | null = null;
  try {
    rootStat = statSync(root);
  } catch {
    result.errors.push({
      file: root,
      code: 'ROOT_NOT_FOUND',
      message: 'Knowledge root does not exist or cannot be read.',
    });
    return result;
  }
  if (!rootStat.isDirectory()) {
    result.errors.push({
      file: root,
      code: 'ROOT_NOT_DIRECTORY',
      message: 'Knowledge root must be a directory.',
    });
    return result;
  }

  const titleOwners = new Map<string, string>();
  const localesByDirectory = new Map<string, Map<string, string>>();

  const display = (file: string): string => {
    const relative = path.relative(root, file);
    return relative === '' ? '.' : relative;
  };

  const addError = (file: string, code: string, message: string): void => {
    result.errors.push({ file: display(file), code, message });
  };

  const addWarning = (file: string, code: string, message: string): void => {
    result.warnings.push({ file: display(file), code, message });
  };

  const registerTitle = (file: string, title: string): void => {
    const normalized = title.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return;
    if (titleOwners.has(normalized)) {
      addError(
        file,
        'DUPLICATE_TITLE',
        'Title duplicates another indexed document.',
      );
      return;
    }
    titleOwners.set(normalized, file);
  };

  const registerLocale = (file: string, locale?: string): void => {
    if (!locale) return;
    const directory = path.dirname(file);
    const locales =
      localesByDirectory.get(directory) ?? new Map<string, string>();
    if (!locales.has(locale)) locales.set(locale, file);
    localesByDirectory.set(directory, locales);
  };

  const inspectFile = (file: string, text: string, extension: string): void => {
    const issues = checkCommonContent(display(file), text);
    const metadata =
      extension === '.md' || extension === '.txt'
        ? readMarkdownMetadata(file, text)
        : extension === '.json'
          ? readJsonMetadata(file, text)
          : readCsvMetadata(file, text);
    issues.push(...metadata.issues);
    for (const issue of issues) {
      addError(file, issue.code, issue.message);
    }
    registerTitle(file, metadata.title);
    if (extension === '.md' || extension === '.txt') {
      registerLocale(file, metadata.locale);
    }
  };

  function walk(directory: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      addError(
        directory,
        'DIRECTORY_READ_ERROR',
        'Could not read a directory in the knowledge folder.',
      );
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(directory, entry.name);
      let stats: ReturnType<typeof lstatSync>;
      try {
        stats = lstatSync(fullPath);
      } catch {
        addError(fullPath, 'FILE_STAT_ERROR', 'Could not read file metadata.');
        continue;
      }

      if (stats.isSymbolicLink()) {
        addError(
          fullPath,
          'SYMLINK_NOT_ALLOWED',
          'Symbolic links are not allowed in the knowledge folder.',
        );
        continue;
      }

      if (stats.isDirectory()) {
        if (
          IGNORED_DIRECTORIES.has(entry.name.toLowerCase()) ||
          entry.name.startsWith('_')
        ) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (!stats.isFile()) continue;
      if (entry.name.toLowerCase() === 'readme.md') continue;

      result.filesScanned += 1;
      const extension = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        addError(
          fullPath,
          'UNSUPPORTED_EXTENSION',
          `Only .md, .txt, .json, and .csv files are indexed; found "${
            extension || 'no extension'
          }".`,
        );
        continue;
      }

      result.indexedFiles += 1;
      result.totalBytes += stats.size;

      if (stats.size > MAX_FILE_BYTES) {
        addError(fullPath, 'FILE_TOO_LARGE', 'File exceeds the 1 MB limit.');
        continue;
      }

      let buffer: Buffer;
      try {
        buffer = readFileSync(fullPath);
      } catch {
        addError(fullPath, 'FILE_READ_ERROR', 'Could not read the file.');
        continue;
      }

      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        addError(fullPath, 'INVALID_UTF8', 'File is not valid UTF-8.');
        continue;
      }
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      inspectFile(fullPath, text, extension);
    }
  }

  walk(root);

  if (result.indexedFiles > MAX_INDEXED_FILES) {
    addError(
      root,
      'TOO_MANY_FILES',
      `The corpus has ${result.indexedFiles} indexed files, which exceeds the limit of ${MAX_INDEXED_FILES}.`,
    );
  }

  if (result.totalBytes > MAX_TOTAL_BYTES) {
    addError(root, 'TOTAL_SIZE_EXCEEDED', 'The corpus exceeds 5 MB in total.');
  }

  for (const locales of localesByDirectory.values()) {
    const english = locales.get('en');
    const arabic = locales.get('ar');
    if (english && !arabic) {
      addWarning(
        english,
        'LOCALE_PAIR_MISSING',
        'English Markdown/TXT content has no Arabic counterpart in this directory.',
      );
    }
    if (arabic && !english) {
      addWarning(
        arabic,
        'LOCALE_PAIR_MISSING',
        'Arabic Markdown/TXT content has no English counterpart in this directory.',
      );
    }
  }

  return result;
}

function checkCommonContent(file: string, text: string): ContentIssue[] {
  const issues: ContentIssue[] = [];

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push({ code: 'FORBIDDEN_CONTENT', message: rule.message });
    }
  }

  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push({ code: 'SECRET_PATTERN', message: rule.message });
    }
  }

  const contactAllowed = CONTACT_GUARD_ALLOWLIST.has(
    file.split(path.sep).join('/'),
  );
  const emails: string[] = text.match(EMAIL_PATTERN) ?? [];
  if (
    emails.some(
      (email) =>
        !contactAllowed || !OFFICIAL_CONTACT_EMAILS.has(email.toLowerCase()),
    )
  ) {
    issues.push({
      code: 'EMAIL_PATTERN',
      message: 'Content contains an email address.',
    });
  }

  const phones = findPhoneNumbers(text);
  if (
    phones.some(
      (phone) =>
        !contactAllowed ||
        !OFFICIAL_CONTACT_PHONE_DIGITS.has(digitsOnly(phone)),
    )
  ) {
    issues.push({
      code: 'PHONE_PATTERN',
      message: 'Content contains a phone number.',
    });
  }

  return issues;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function findPhoneNumbers(text: string): string[] {
  const phones = new Set<string>();
  for (const match of text.match(ALGERIAN_PHONE_PATTERN) ?? []) {
    phones.add(match);
  }
  for (const candidate of text.match(INTERNATIONAL_PHONE_CANDIDATE) ?? []) {
    if ((candidate.match(/\d/g) ?? []).length >= 8) {
      phones.add(candidate);
    }
  }
  return [...phones];
}

function titleFromStem(file: string): string {
  const base = path.basename(file, path.extname(file));
  const withoutLocale = base.replace(/[._-](en|ar|fr)$/i, '');
  return (withoutLocale || base).trim();
}

function deriveLocaleFromFilename(file: string): string | undefined {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  if (ALLOWED_LOCALES.has(base)) return base;

  const suffix = /[._-](en|ar|fr)$/.exec(base);
  if (suffix) return suffix[1];

  const parent = path.basename(path.dirname(file)).toLowerCase();
  return ALLOWED_LOCALES.has(parent) ? parent : undefined;
}

function deriveTitleFromBody(file: string, body: string): string {
  const match = /^#\s+(.+)$/m.exec(body);
  if (match) {
    const candidate = match[1].replace(/\s+#+\s*$/, '').trim();
    if (candidate) return candidate;
  }
  return titleFromStem(file);
}

function splitFrontMatter(text: string): FrontMatterSplit {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { yaml: null, body: text, malformed: false };
  }

  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      closing = index;
      break;
    }
  }

  if (closing === -1) {
    return { yaml: null, body: text, malformed: true };
  }

  return {
    yaml: lines.slice(1, closing).join('\n'),
    body: lines.slice(closing + 1).join('\n'),
    malformed: false,
  };
}

function unquoteValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function readMarkdownMetadata(file: string, text: string): DocumentMetadata {
  const split = splitFrontMatter(text);
  const issues: ContentIssue[] = [];
  let title: string | undefined;
  let locale: string | undefined;

  if (split.malformed) {
    issues.push({
      code: 'MALFORMED_FRONT_MATTER',
      message: 'Front matter starts with --- but has no closing delimiter.',
    });
  } else if (split.yaml !== null) {
    const parsed = parseFrontMatter(split.yaml);
    issues.push(...parsed.issues);
    title = parsed.values.title;
    locale = parsed.values.locale;
  }

  if (!title) title = deriveTitleFromBody(file, split.body);
  if (!locale) locale = deriveLocaleFromFilename(file);

  return { title, locale, issues };
}

function parseFrontMatter(yaml: string): FrontMatterParseResult {
  const values: FrontMatterValues = {};
  const issues: FrontMatterIssue[] = [];
  const seen = new Set<string>();
  let activeList: 'tags' | null = null;

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('- ')) {
      if (activeList !== 'tags') {
        issues.push({
          code: 'INVALID_FRONT_MATTER',
          message: 'Unexpected list item in front matter.',
        });
        continue;
      }
      const item = unquoteValue(line.slice(2).trim());
      if (!item) {
        issues.push({
          code: 'INVALID_TAGS',
          message: 'Tags must be non-empty strings.',
        });
      } else {
        values.tags = [...(values.tags ?? []), item];
      }
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!match) {
      issues.push({
        code: 'INVALID_FRONT_MATTER',
        message: 'Front matter must use key: value lines.',
      });
      activeList = null;
      continue;
    }

    const key = match[1];
    const rawValue = match[2].trim();
    activeList = null;

    if (key === 'title') {
      seen.add('title');
      const value = unquoteValue(rawValue);
      if (!value) {
        issues.push({
          code: 'INVALID_TITLE',
          message: 'Title must be a non-empty string.',
        });
      } else {
        values.title = value;
      }
    } else if (key === 'locale') {
      seen.add('locale');
      const value = unquoteValue(rawValue).toLowerCase();
      if (!ALLOWED_LOCALES.has(value)) {
        issues.push({
          code: 'INVALID_LOCALE',
          message: 'Locale must be en, ar, or fr.',
        });
      } else {
        values.locale = value;
      }
    } else if (key === 'tags') {
      seen.add('tags');
      if (rawValue === '') {
        values.tags = values.tags ?? [];
        activeList = 'tags';
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inner = rawValue.slice(1, -1).trim();
        const items =
          inner === ''
            ? []
            : inner.split(',').map((item) => unquoteValue(item));
        if (items.some((item) => item === '')) {
          issues.push({
            code: 'INVALID_TAGS',
            message: 'Tags must be non-empty strings.',
          });
        } else {
          values.tags = items;
        }
      } else {
        issues.push({
          code: 'INVALID_TAGS',
          message: 'Tags must be an inline array or a block list.',
        });
      }
    } else if (key === 'priority') {
      seen.add('priority');
      const value = unquoteValue(rawValue);
      if (!/^-?\d+$/.test(value)) {
        issues.push({
          code: 'INVALID_PRIORITY',
          message: 'Priority must be an integer from 1 to 5.',
        });
      } else {
        const priority = Number(value);
        if (priority < 1 || priority > 5) {
          issues.push({
            code: 'INVALID_PRIORITY',
            message: 'Priority must be an integer from 1 to 5.',
          });
        } else {
          values.priority = priority;
        }
      }
    }
  }

  if (!seen.has('title')) {
    issues.push({
      code: 'INVALID_TITLE',
      message: 'Front matter must include a non-empty title.',
    });
  }
  if (!seen.has('locale')) {
    issues.push({
      code: 'INVALID_LOCALE',
      message: 'Front matter must include a locale of en, ar, or fr.',
    });
  }
  if (!seen.has('tags')) {
    issues.push({
      code: 'INVALID_TAGS',
      message: 'Front matter must include a tags array.',
    });
  }
  if (!seen.has('priority')) {
    issues.push({
      code: 'INVALID_PRIORITY',
      message: 'Front matter must include a priority from 1 to 5.',
    });
  }

  return { values, issues };
}

function jsonExceedsDepth(value: unknown, limit: number): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.value === null || typeof current.value !== 'object') continue;
    if (current.depth > limit) return true;

    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }

  return false;
}

function readJsonMetadata(file: string, text: string): DocumentMetadata {
  const issues: ContentIssue[] = [];
  let title: string | undefined;
  let locale: string | undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    issues.push({ code: 'INVALID_JSON', message: 'File is not valid JSON.' });
    return { title: titleFromStem(file), issues };
  }

  if (jsonExceedsDepth(parsed, MAX_JSON_DEPTH)) {
    issues.push({
      code: 'JSON_TOO_DEEP',
      message: 'JSON nesting exceeds 10 levels.',
    });
  }

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if ('title' in record) {
      if (typeof record.title !== 'string' || record.title.trim() === '') {
        issues.push({
          code: 'INVALID_JSON_METADATA',
          message: 'Top-level title must be a non-empty string.',
        });
      } else {
        title = record.title.trim();
      }
    }
    if ('locale' in record) {
      if (
        typeof record.locale !== 'string' ||
        !ALLOWED_LOCALES.has(record.locale.trim().toLowerCase())
      ) {
        issues.push({
          code: 'INVALID_JSON_METADATA',
          message: 'Top-level locale must be en, ar, or fr.',
        });
      } else {
        locale = record.locale.trim().toLowerCase();
      }
    }
  }

  return { title: title ?? titleFromStem(file), locale, issues };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  cells.push(current);
  return cells;
}

function readCsvMetadata(file: string, text: string): DocumentMetadata {
  const issues: ContentIssue[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    const cells = parseCsvLine(line);
    if (cells.some((cell) => /^[=+\-@]/.test(cell.trim()))) {
      issues.push({
        code: 'CSV_FORMULA_INJECTION',
        message: `CSV row ${
          index + 1
        } contains a cell that begins with a formula character.`,
      });
    }
  }

  return {
    title: titleFromStem(file),
    locale: deriveLocaleFromFilename(file),
    issues,
  };
}

function printResult(result: CheckResult, root: string): void {
  console.log(`Knowledge root: ${root}`);

  for (const warning of result.warnings) {
    console.warn(
      `WARNING [${warning.code}] ${warning.file}: ${warning.message}`,
    );
  }
  for (const error of result.errors) {
    console.error(`ERROR [${error.code}] ${error.file}: ${error.message}`);
  }

  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Indexed files: ${result.indexedFiles}`);
  console.log(`Total indexed bytes: ${result.totalBytes}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Errors: ${result.errors.length}`);

  if (result.errors.length === 0) {
    console.log('Knowledge check passed.');
  } else {
    console.error('Knowledge check failed.');
  }
}

function main(): void {
  const root = resolveKnowledgeRoot();
  const result = checkKnowledge(root);
  printResult(result, root);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `Knowledge check failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    process.exitCode = 1;
  }
}
