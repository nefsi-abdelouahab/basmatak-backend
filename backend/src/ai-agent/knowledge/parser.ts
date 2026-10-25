import * as path from 'path';
import {
  KnowledgeBlock,
  KnowledgeHeading,
  KnowledgeIssue,
  KnowledgeIssueCode,
  KnowledgeLocale,
  KnowledgeParseInput,
  KnowledgeParseResult,
} from './knowledge.types';

/**
 * Deterministic parser for the four supported corpus formats.
 *
 * Front matter follows the small, documented subset understood by
 * `src/scripts/ai-check.ts`: `key: value` lines plus inline or block-list tags.
 * Invalid optional values fall back to safe defaults. Structurally malformed
 * front matter, malformed JSON/CSV, and JSON nesting beyond 10 levels fail
 * closed and return no document.
 */

const ALLOWED_LOCALES = new Set<KnowledgeLocale>(['en', 'ar', 'fr']);
const DEFAULT_PRIORITY = 3;
const MAX_JSON_DEPTH = 10;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+/;

interface FrontMatterValues {
  title?: string;
  locale?: KnowledgeLocale;
  tags?: string[];
  priority?: number;
}

interface FrontMatterParseResult {
  values: FrontMatterValues;
  fatalIssue?: { code: KnowledgeIssueCode; message: string };
}

interface FrontMatterSplit {
  yaml: string | null;
  body: string;
  malformed: boolean;
}

interface JsonLeaf {
  path: string;
  value: string;
}

interface CsvLineResult {
  ok: boolean;
  cells: string[];
}

function makeIssue(
  source: string,
  code: KnowledgeIssueCode,
  message: string,
): KnowledgeIssue {
  return { file: source, code, message };
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isLocale(value: string): value is KnowledgeLocale {
  return ALLOWED_LOCALES.has(value as KnowledgeLocale);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function titleFromStem(source: string): string {
  const base = path.posix.basename(source, path.posix.extname(source));
  const withoutLocale = base.replace(/[._-](en|ar|fr)$/i, '');
  return (withoutLocale || base).trim();
}

function deriveLocale(source: string): KnowledgeLocale {
  const base = path.posix
    .basename(source, path.posix.extname(source))
    .toLowerCase();
  if (isLocale(base)) return base;

  const suffix = /[._-](en|ar|fr)$/.exec(base);
  if (suffix) return suffix[1] as KnowledgeLocale;

  const parent = path.posix.basename(path.posix.dirname(source)).toLowerCase();
  return isLocale(parent) ? parent : 'en';
}

function extractFirstH1(body: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  if (!match) return undefined;
  const candidate = match[1].replace(/\s+#+\s*$/, '').trim();
  return candidate || undefined;
}

function splitFrontMatter(text: string): FrontMatterSplit {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') {
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

function parseFrontMatter(yaml: string): FrontMatterParseResult {
  const values: FrontMatterValues = {};
  let activeList: 'tags' | null = null;

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('- ')) {
      if (activeList !== 'tags') {
        return {
          values,
          fatalIssue: {
            code: 'INVALID_FRONT_MATTER',
            message: 'Unexpected list item in front matter.',
          },
        };
      }
      const item = unquoteValue(line.slice(2).trim());
      if (item) {
        values.tags = [...(values.tags ?? []), item];
      }
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!match) {
      return {
        values,
        fatalIssue: {
          code: 'INVALID_FRONT_MATTER',
          message: 'Front matter must use key: value lines.',
        },
      };
    }

    const key = match[1];
    const rawValue = match[2].trim();
    activeList = null;

    if (key === 'title') {
      const value = unquoteValue(rawValue);
      if (value) values.title = value;
    } else if (key === 'locale') {
      const value = unquoteValue(rawValue).toLowerCase();
      if (isLocale(value)) values.locale = value;
    } else if (key === 'tags') {
      if (rawValue === '') {
        values.tags = values.tags ?? [];
        activeList = 'tags';
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inner = rawValue.slice(1, -1).trim();
        if (inner === '') {
          values.tags = [];
        } else {
          values.tags = inner
            .split(',')
            .map((item) => unquoteValue(item).trim())
            .filter((item) => item !== '');
        }
      } else {
        values.tags = undefined;
      }
    } else if (key === 'priority') {
      const value = unquoteValue(rawValue);
      if (/^-?\d+$/.test(value)) {
        const priority = Number(value);
        if (priority >= 1 && priority <= 5) {
          values.priority = priority;
        }
      }
    }
  }

  return { values };
}

function parseHeading(line: string): KnowledgeHeading | undefined {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!match) return undefined;
  const text = match[2].replace(/\s+#+\s*$/, '').trim();
  if (!text) return undefined;
  return { level: match[1].length, text };
}

function formatBlockText(lines: string[]): string {
  if (lines.length === 0) return '';
  const isList = lines.some((line) => LIST_ITEM_PATTERN.test(line));
  return lines
    .map((line) => line.trim())
    .join(isList ? '\n' : ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMarkdownBlocks(body: string): {
  blocks: KnowledgeBlock[];
  headings: KnowledgeHeading[];
} {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: KnowledgeBlock[] = [];
  const headings: KnowledgeHeading[] = [];
  const headingStack: KnowledgeHeading[] = [];
  let buffer: string[] = [];
  let bufferTrail: string[] = [];
  let bufferPath: KnowledgeHeading[] = [];
  let groupIndex = 0;
  let currentGroup = `section:${groupIndex}`;
  let inFence = false;

  const flush = (): void => {
    if (buffer.length === 0) return;
    const text = formatBlockText(buffer);
    if (text) {
      blocks.push({
        text,
        headingTrail: [...bufferTrail],
        headingPath: bufferPath.map((heading) => ({ ...heading })),
        group: currentGroup,
      });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      buffer.push(line.trim());
      continue;
    }

    if (!inFence) {
      const heading = parseHeading(line);
      if (heading) {
        flush();
        headings.push(heading);
        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].level >= heading.level
        ) {
          headingStack.pop();
        }
        headingStack.push(heading);
        groupIndex += 1;
        currentGroup = `section:${groupIndex}`;
        bufferTrail = headingStack.map((item) => item.text);
        bufferPath = headingStack.map((item) => ({ ...item }));
        continue;
      }
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    if (buffer.length === 0) {
      bufferTrail = headingStack.map((item) => item.text);
      bufferPath = headingStack.map((item) => ({ ...item }));
    }
    buffer.push(line.trim());
  }

  flush();
  return { blocks, headings };
}

function parseTxtBlocks(body: string): KnowledgeBlock[] {
  const paragraphs = body.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const blocks: KnowledgeBlock[] = [];

  for (const paragraph of paragraphs) {
    const text = paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (text) {
      blocks.push({ text, headingTrail: [], group: 'document' });
    }
  }

  return blocks;
}

function parseProse(input: KnowledgeParseInput): KnowledgeParseResult {
  const source = toPosixPath(input.source);
  const split = splitFrontMatter(input.text);

  if (split.malformed) {
    return {
      document: null,
      issues: [
        makeIssue(
          source,
          'MALFORMED_FRONT_MATTER',
          'Front matter starts with --- but has no closing delimiter.',
        ),
      ],
    };
  }

  let frontMatter: FrontMatterValues = {};
  if (split.yaml !== null) {
    const parsed = parseFrontMatter(split.yaml);
    if (parsed.fatalIssue) {
      return {
        document: null,
        issues: [
          makeIssue(source, parsed.fatalIssue.code, parsed.fatalIssue.message),
        ],
      };
    }
    frontMatter = parsed.values;
  }

  const body = split.body;
  const markdown = input.format === 'md';
  const parsedBlocks = markdown
    ? parseMarkdownBlocks(body)
    : { blocks: parseTxtBlocks(body), headings: [] };

  return {
    document: {
      source,
      format: input.format,
      title: frontMatter.title ?? extractFirstH1(body) ?? titleFromStem(source),
      locale: frontMatter.locale ?? deriveLocale(source),
      tags: frontMatter.tags ?? [],
      priority: frontMatter.priority ?? DEFAULT_PRIORITY,
      text: body.trim(),
      blocks: parsedBlocks.blocks,
      headings: parsedBlocks.headings,
    },
    issues: [],
  };
}

function exceedsJsonDepth(value: unknown, limit: number): boolean {
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

function collectJsonLeaves(value: unknown, prefix: string): JsonLeaf[] {
  const leaves: JsonLeaf[] = [];

  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === 'string') {
      const text = current.trim();
      if (text) {
        leaves.push({ path: currentPath || '$', value: text });
      }
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        visit(item, `${currentPath}[${index}]`);
      });
      return;
    }

    if (isPlainObject(current)) {
      for (const [key, child] of Object.entries(current)) {
        visit(child, currentPath ? `${currentPath}.${key}` : key);
      }
    }
  };

  visit(value, prefix);
  return leaves;
}

function blockFromLeaves(
  leaves: JsonLeaf[],
  group: string,
): KnowledgeBlock | null {
  if (leaves.length === 0) return null;
  return {
    text: leaves.map((leaf) => `${leaf.path}: ${leaf.value}`).join('\n'),
    headingTrail: [],
    group,
    keyPath: leaves.length === 1 ? leaves[0].path : undefined,
  };
}

function buildJsonBlocks(root: unknown): KnowledgeBlock[] {
  if (Array.isArray(root)) {
    const blocks: KnowledgeBlock[] = [];
    root.forEach((item, index) => {
      const block = blockFromLeaves(
        collectJsonLeaves(item, `[${index}]`),
        `root:${index}`,
      );
      if (block) blocks.push(block);
    });
    return blocks;
  }

  if (isPlainObject(root)) {
    const blocks: KnowledgeBlock[] = [];
    for (const [key, value] of Object.entries(root)) {
      if (key === 'title' || key === 'locale') continue;

      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => isPlainObject(item))
      ) {
        value.forEach((item, index) => {
          const block = blockFromLeaves(
            collectJsonLeaves(item, `${key}[${index}]`),
            `key:${key}:${index}`,
          );
          if (block) blocks.push(block);
        });
      } else if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string')
      ) {
        value.forEach((item, index) => {
          const block = blockFromLeaves(
            [{ path: `${key}[${index}]`, value: item.trim() }],
            `key:${key}:${index}`,
          );
          if (block) blocks.push(block);
        });
      } else {
        const block = blockFromLeaves(
          collectJsonLeaves(value, key),
          `key:${key}`,
        );
        if (block) blocks.push(block);
      }
    }
    return blocks;
  }

  if (typeof root === 'string') {
    const text = root.trim();
    return text ? [{ text, headingTrail: [], group: 'document' }] : [];
  }

  return [];
}

function parseJson(input: KnowledgeParseInput): KnowledgeParseResult {
  const source = toPosixPath(input.source);
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.text);
  } catch {
    return {
      document: null,
      issues: [makeIssue(source, 'INVALID_JSON', 'File is not valid JSON.')],
    };
  }

  if (exceedsJsonDepth(parsed, MAX_JSON_DEPTH)) {
    return {
      document: null,
      issues: [
        makeIssue(source, 'JSON_TOO_DEEP', 'JSON nesting exceeds 10 levels.'),
      ],
    };
  }

  let title = titleFromStem(source);
  let locale = deriveLocale(source);

  if (isPlainObject(parsed)) {
    if ('title' in parsed) {
      if (typeof parsed.title !== 'string' || parsed.title.trim() === '') {
        return {
          document: null,
          issues: [
            makeIssue(
              source,
              'INVALID_JSON_METADATA',
              'Top-level title must be a non-empty string.',
            ),
          ],
        };
      }
      title = parsed.title.trim();
    }

    if ('locale' in parsed) {
      const candidate =
        typeof parsed.locale === 'string'
          ? parsed.locale.trim().toLowerCase()
          : '';
      if (!isLocale(candidate)) {
        return {
          document: null,
          issues: [
            makeIssue(
              source,
              'INVALID_JSON_METADATA',
              'Top-level locale must be en, ar, or fr.',
            ),
          ],
        };
      }
      locale = candidate;
    }
  }

  const blocks = buildJsonBlocks(parsed);
  return {
    document: {
      source,
      format: 'json',
      title,
      locale,
      tags: [],
      priority: DEFAULT_PRIORITY,
      text: blocks.map((block) => block.text).join('\n\n'),
      blocks,
    },
    issues: [],
  };
}

function parseCsvLine(line: string): CsvLineResult {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let fieldStarted = false;

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
    } else if (character === ',') {
      cells.push(current);
      current = '';
      fieldStarted = false;
    } else if (character === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else {
      current += character;
      fieldStarted = true;
    }
  }

  if (inQuotes) {
    return { ok: false, cells };
  }

  cells.push(current);
  return { ok: true, cells };
}

function parseCsv(input: KnowledgeParseInput): KnowledgeParseResult {
  const source = toPosixPath(input.source);
  const lines = input.text.replace(/\r\n?/g, '\n').split('\n');
  const rows: Array<{ line: number; cells: string[] }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;

    const parsed = parseCsvLine(line);
    if (!parsed.ok) {
      return {
        document: null,
        issues: [
          makeIssue(
            source,
            'INVALID_CSV',
            `CSV row ${index + 1} has an unterminated quoted field.`,
          ),
        ],
      };
    }
    rows.push({ line: index + 1, cells: parsed.cells });
  }

  if (rows.length === 0) {
    return {
      document: null,
      issues: [makeIssue(source, 'INVALID_CSV', 'CSV file has no header row.')],
    };
  }

  const header = rows[0].cells.map((cell) => cell.trim());
  if (header.some((cell) => cell === '')) {
    return {
      document: null,
      issues: [
        makeIssue(
          source,
          'INVALID_CSV',
          'CSV header contains an empty column name.',
        ),
      ],
    };
  }

  for (const row of rows) {
    if (row.cells.some((cell) => /^[=+\-@]/.test(cell.trim()))) {
      return {
        document: null,
        issues: [
          makeIssue(
            source,
            'CSV_FORMULA_INJECTION',
            `CSV row ${row.line} contains a cell that begins with a formula character.`,
          ),
        ],
      };
    }
  }

  const blocks: KnowledgeBlock[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.cells.every((cell) => cell.trim() === '')) continue;

    if (row.cells.length !== header.length) {
      return {
        document: null,
        issues: [
          makeIssue(
            source,
            'INVALID_CSV',
            `CSV row ${row.line} has ${row.cells.length} columns; expected ${header.length}.`,
          ),
        ],
      };
    }

    const recordLines: string[] = [];
    header.forEach((name, column) => {
      const value = row.cells[column].trim();
      if (value) recordLines.push(`${name}: ${value}`);
    });
    if (recordLines.length === 0) continue;

    blocks.push({
      text: recordLines.join('\n'),
      headingTrail: [],
      group: `row:${row.line}`,
    });
  }

  return {
    document: {
      source,
      format: 'csv',
      title: titleFromStem(source),
      locale: deriveLocale(source),
      tags: [],
      priority: DEFAULT_PRIORITY,
      text: blocks.map((block) => block.text).join('\n\n'),
      blocks,
    },
    issues: [],
  };
}

/**
 * Parse one already-decoded UTF-8 knowledge file. Pure and synchronous.
 */
export function parseKnowledgeDocument(
  input: KnowledgeParseInput,
): KnowledgeParseResult {
  const source = toPosixPath(input.source);
  const text =
    input.text.charCodeAt(0) === 0xfeff ? input.text.slice(1) : input.text;
  const normalized: KnowledgeParseInput = { ...input, source, text };

  switch (input.format) {
    case 'md':
    case 'txt':
      return parseProse(normalized);
    case 'json':
      return parseJson(normalized);
    case 'csv':
      return parseCsv(normalized);
    default:
      return {
        document: null,
        issues: [
          makeIssue(
            source,
            'UNSUPPORTED_FORMAT',
            'Unsupported knowledge format.',
          ),
        ],
      };
  }
}

/** Thin Nest provider wrapper; the parser itself remains framework-free. */
export class KnowledgeParser {
  parse(input: KnowledgeParseInput): KnowledgeParseResult {
    return parseKnowledgeDocument(input);
  }
}
