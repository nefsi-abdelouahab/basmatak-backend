import { Dirent, lstatSync, readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';
import {
  KnowledgeFormat,
  KnowledgeIssue,
  KnowledgeIssueCode,
  KnowledgeLoadResult,
} from './knowledge.types';
import { parseKnowledgeDocument } from './parser';

/**
 * Deterministic, Nest-independent loader for the committed knowledge corpus.
 *
 * The loader mirrors the safety posture of `src/scripts/ai-check.ts`: strict
 * UTF-8, no symlinks, no hidden or underscore configuration content, bounded
 * file counts and sizes, and fail-closed diagnostics that never contain file
 * contents. A single bad file is excluded with an issue; a bad root or a
 * corpus-level limit returns an empty result.
 */

const ALLOWED_EXTENSIONS = new Map<string, KnowledgeFormat>([
  ['.md', 'md'],
  ['.txt', 'txt'],
  ['.json', 'json'],
  ['.csv', 'csv'],
]);

const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);

export const MAX_INDEXED_FILES = 100;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 1024 * 1024;

const FORBIDDEN_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  message: string;
}> = [
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

const EMAIL_PATTERN = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}/i;
const ALGERIAN_PHONE_PATTERN = /\b0[2-7](?:[\s.-]?\d{2}){3,4}\b/;
const INTERNATIONAL_PHONE_CANDIDATE =
  /(?:^|[^\w])(\+\d[\d\s().-]{6,}\d)(?!\w)/g;

interface CandidateFile {
  absolutePath: string;
  relativePath: string;
  format: KnowledgeFormat;
  size: number;
}

interface CollectionResult {
  candidates: CandidateFile[];
  issues: KnowledgeIssue[];
  filesScanned: number;
}

function makeIssue(
  file: string,
  code: KnowledgeIssueCode,
  message: string,
): KnowledgeIssue {
  return { file, code, message };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function displayPath(root: string, file: string): string {
  const relative = path.relative(root, file);
  return relative === '' ? '.' : toPosixPath(relative);
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/**
 * Resolve the corpus root exactly like `src/scripts/ai-check.ts`: an explicit
 * argument wins, then `AI_AGENT_KNOWLEDGE_DIR`, then `process.cwd()/ai-agent`.
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

function emptyResult(issue?: KnowledgeIssue): KnowledgeLoadResult {
  return {
    documents: [],
    issues: issue ? [issue] : [],
    filesScanned: 0,
    indexedFiles: 0,
    totalBytes: 0,
  };
}

function hasPhoneNumber(text: string): boolean {
  if (ALGERIAN_PHONE_PATTERN.test(text)) return true;
  const candidates: string[] = text.match(INTERNATIONAL_PHONE_CANDIDATE) ?? [];
  return candidates.some(
    (candidate) => (candidate.match(/\d/g) ?? []).length >= 8,
  );
}

function checkContentSafety(
  relativePath: string,
  text: string,
): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push(makeIssue(relativePath, 'FORBIDDEN_CONTENT', rule.message));
    }
  }

  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push(makeIssue(relativePath, 'SECRET_PATTERN', rule.message));
    }
  }

  if (text.includes('@') && EMAIL_PATTERN.test(text)) {
    issues.push(
      makeIssue(
        relativePath,
        'EMAIL_PATTERN',
        'Content contains an email address.',
      ),
    );
  }

  if (hasPhoneNumber(text)) {
    issues.push(
      makeIssue(
        relativePath,
        'PHONE_PATTERN',
        'Content contains a phone number.',
      ),
    );
  }

  return issues;
}

function collectFiles(root: string): CollectionResult {
  const candidates: CandidateFile[] = [];
  const issues: KnowledgeIssue[] = [];
  let filesScanned = 0;

  const walk = (directory: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      issues.push(
        makeIssue(
          displayPath(root, directory),
          'DIRECTORY_READ_ERROR',
          'Could not read a directory in the knowledge folder.',
        ),
      );
      return;
    }

    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const absolutePath = path.join(directory, entry.name);
      if (!isWithinRoot(root, absolutePath)) {
        issues.push(
          makeIssue(
            displayPath(root, absolutePath),
            'PATH_OUTSIDE_ROOT',
            'Path resolves outside the knowledge root.',
          ),
        );
        continue;
      }

      let stats: ReturnType<typeof lstatSync>;
      try {
        stats = lstatSync(absolutePath);
      } catch {
        issues.push(
          makeIssue(
            displayPath(root, absolutePath),
            'FILE_STAT_ERROR',
            'Could not read file metadata.',
          ),
        );
        continue;
      }

      if (stats.isSymbolicLink()) {
        issues.push(
          makeIssue(
            displayPath(root, absolutePath),
            'SYMLINK_NOT_ALLOWED',
            'Symbolic links are not allowed in the knowledge folder.',
          ),
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
        walk(absolutePath);
        continue;
      }

      if (!stats.isFile()) continue;
      if (entry.name.toLowerCase() === 'readme.md') continue;

      filesScanned += 1;
      const extension = path.extname(entry.name).toLowerCase();
      const format = ALLOWED_EXTENSIONS.get(extension);
      const relativePath = displayPath(root, absolutePath);

      if (!format) {
        issues.push(
          makeIssue(
            relativePath,
            'UNSUPPORTED_EXTENSION',
            `Only .md, .txt, .json, and .csv files are indexed; found "${
              extension || 'no extension'
            }".`,
          ),
        );
        continue;
      }

      candidates.push({
        absolutePath,
        relativePath,
        format,
        size: stats.size,
      });
    }
  };

  walk(root);

  candidates.sort((left, right) =>
    compareStrings(left.relativePath, right.relativePath),
  );

  return { candidates, issues, filesScanned };
}

function loadKnowledgeUnsafe(rootDir?: string): KnowledgeLoadResult {
  const root = resolveKnowledgeRoot(rootDir);

  let rootStats: ReturnType<typeof lstatSync>;
  try {
    rootStats = lstatSync(root);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return emptyResult(
      makeIssue(
        '.',
        code === 'ENOENT' ? 'ROOT_NOT_FOUND' : 'ROOT_STAT_ERROR',
        code === 'ENOENT'
          ? 'Knowledge root does not exist or cannot be read.'
          : 'Knowledge root metadata could not be read.',
      ),
    );
  }

  if (rootStats.isSymbolicLink()) {
    return emptyResult(
      makeIssue(
        '.',
        'ROOT_SYMLINK',
        'Knowledge root must not be a symbolic link.',
      ),
    );
  }

  if (!rootStats.isDirectory()) {
    return emptyResult(
      makeIssue(
        '.',
        'ROOT_NOT_DIRECTORY',
        'Knowledge root must be a directory.',
      ),
    );
  }

  const collected = collectFiles(root);
  const result: KnowledgeLoadResult = {
    documents: [],
    issues: collected.issues,
    filesScanned: collected.filesScanned,
    indexedFiles: 0,
    totalBytes: 0,
  };

  if (collected.candidates.length > MAX_INDEXED_FILES) {
    result.issues.push(
      makeIssue(
        '.',
        'TOO_MANY_FILES',
        `The corpus has more than ${MAX_INDEXED_FILES} indexed files.`,
      ),
    );
    return result;
  }

  const candidateBytes = collected.candidates.reduce(
    (total, candidate) => total + candidate.size,
    0,
  );
  if (candidateBytes > MAX_TOTAL_BYTES) {
    result.issues.push(
      makeIssue(
        '.',
        'TOTAL_SIZE_EXCEEDED',
        'The corpus exceeds 5 MB in total.',
      ),
    );
    return result;
  }

  for (const candidate of collected.candidates) {
    if (candidate.size > MAX_FILE_BYTES) {
      result.issues.push(
        makeIssue(
          candidate.relativePath,
          'FILE_TOO_LARGE',
          'File exceeds the 1 MB limit.',
        ),
      );
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = readFileSync(candidate.absolutePath);
    } catch {
      result.issues.push(
        makeIssue(
          candidate.relativePath,
          'FILE_READ_ERROR',
          'Could not read the file.',
        ),
      );
      continue;
    }

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      result.issues.push(
        makeIssue(
          candidate.relativePath,
          'INVALID_UTF8',
          'File is not valid UTF-8.',
        ),
      );
      continue;
    }

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const safetyIssues = checkContentSafety(candidate.relativePath, text);
    if (safetyIssues.length > 0) {
      result.issues.push(...safetyIssues);
      continue;
    }

    const parsed = parseKnowledgeDocument({
      source: candidate.relativePath,
      format: candidate.format,
      text,
    });

    if (parsed.issues.length > 0) {
      result.issues.push(...parsed.issues);
      continue;
    }

    if (!parsed.document) {
      result.issues.push(
        makeIssue(
          candidate.relativePath,
          'KNOWLEDGE_PARSE_ERROR',
          'The file could not be parsed.',
        ),
      );
      continue;
    }

    result.documents.push(parsed.document);
    result.indexedFiles += 1;
    result.totalBytes += candidate.size;
  }

  return result;
}

/**
 * Load the corpus. This function never throws for filesystem or parse errors;
 * callers receive a fail-closed result instead.
 */
export function loadKnowledge(rootDir?: string): KnowledgeLoadResult {
  try {
    return loadKnowledgeUnsafe(rootDir);
  } catch {
    return emptyResult(
      makeIssue(
        '.',
        'KNOWLEDGE_LOAD_ERROR',
        'The knowledge folder could not be loaded.',
      ),
    );
  }
}

/**
 * Thin Nest provider wrapper. Constructing it performs no filesystem work, so
 * boot-time indexing remains a Session 5 concern.
 */
export class KnowledgeLoader {
  constructor(private readonly rootDir?: string) {}

  load(rootDir?: string): KnowledgeLoadResult {
    return loadKnowledge(rootDir ?? this.rootDir);
  }
}
