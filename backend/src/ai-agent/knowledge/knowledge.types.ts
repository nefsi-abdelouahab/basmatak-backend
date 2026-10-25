/**
 * Shared, Nest-independent types for knowledge ingestion.
 *
 * Session 4 only loads, parses, chunks, and normalizes the committed corpus.
 * There is intentionally no index, retriever, database model, or provider
 * dependency in this file.
 */

export type KnowledgeLocale = 'en' | 'ar' | 'fr';

export type KnowledgeFormat = 'md' | 'txt' | 'json' | 'csv';

export interface KnowledgeHeading {
  /** Markdown heading level, 1 through 6. */
  level: number;
  text: string;
}

/**
 * A parser-level block. Blocks are the smallest unit the chunker may reorder
 * or merge; different `group` values are never combined into one chunk.
 */
export interface KnowledgeBlock {
  /** Block text. Markdown heading lines are represented by `headingTrail`. */
  text: string;
  /** Human-readable heading trail, outermost heading first. */
  headingTrail: string[];
  /** Heading levels retained for metadata and parser tests. */
  headingPath?: KnowledgeHeading[];
  /**
   * Chunking boundary. Markdown sections, JSON records, and CSV rows use
   * distinct groups so unrelated records never share a chunk.
   */
  group?: string;
  /** Flattened JSON key path when a block represents a single string leaf. */
  keyPath?: string;
}

export interface KnowledgeDocument {
  /** Corpus-relative path using POSIX separators. */
  source: string;
  format: KnowledgeFormat;
  title: string;
  locale: KnowledgeLocale;
  tags: string[];
  /** 1 (core) through 5 (low). The safe default is 3. */
  priority: number;
  /** Parsed body text. Front matter is removed from Markdown and TXT. */
  text: string;
  blocks: KnowledgeBlock[];
  /** Markdown headings in document order. Empty for TXT, JSON, and CSV. */
  headings?: KnowledgeHeading[];
}

export interface KnowledgeChunk {
  /** `${source}#${ordinal}`. The ordinal is 1-based and deterministic. */
  id: string;
  source: string;
  ordinal: number;
  headingTrail: string[];
  text: string;
  charCount: number;
  /** Document metadata copied for later ranking without re-reading a file. */
  title: string;
  locale: KnowledgeLocale;
  tags: string[];
  priority: number;
}

export type KnowledgeIssueCode =
  | 'ROOT_NOT_FOUND'
  | 'ROOT_NOT_DIRECTORY'
  | 'ROOT_SYMLINK'
  | 'ROOT_STAT_ERROR'
  | 'DIRECTORY_READ_ERROR'
  | 'FILE_STAT_ERROR'
  | 'SYMLINK_NOT_ALLOWED'
  | 'UNSUPPORTED_EXTENSION'
  | 'FILE_TOO_LARGE'
  | 'FILE_READ_ERROR'
  | 'INVALID_UTF8'
  | 'TOO_MANY_FILES'
  | 'TOTAL_SIZE_EXCEEDED'
  | 'PATH_OUTSIDE_ROOT'
  | 'FORBIDDEN_CONTENT'
  | 'SECRET_PATTERN'
  | 'EMAIL_PATTERN'
  | 'PHONE_PATTERN'
  | 'MALFORMED_FRONT_MATTER'
  | 'INVALID_FRONT_MATTER'
  | 'INVALID_JSON'
  | 'JSON_TOO_DEEP'
  | 'INVALID_JSON_METADATA'
  | 'INVALID_CSV'
  | 'CSV_FORMULA_INJECTION'
  | 'UNSUPPORTED_FORMAT'
  | 'KNOWLEDGE_PARSE_ERROR'
  | 'KNOWLEDGE_LOAD_ERROR';

/**
 * A safe diagnostic. `file` is relative to the corpus root (`.` for the root
 * itself) and `message` never contains file contents.
 */
export interface KnowledgeIssue {
  file: string;
  code: KnowledgeIssueCode;
  message: string;
}

export interface KnowledgeLoadResult {
  documents: KnowledgeDocument[];
  issues: KnowledgeIssue[];
  /** Non-ignored file entries inspected, including unsupported extensions. */
  filesScanned: number;
  /** Documents that loaded and parsed successfully. */
  indexedFiles: number;
  /** Bytes belonging to successfully indexed documents. */
  totalBytes: number;
}

export interface KnowledgeParseInput {
  /** Corpus-relative path using POSIX separators. */
  source: string;
  format: KnowledgeFormat;
  text: string;
}

export interface KnowledgeParseResult {
  document: KnowledgeDocument | null;
  issues: KnowledgeIssue[];
}

export interface KnowledgeChunkOptions {
  /** Soft target size. Defaults to 900 characters. */
  targetChars?: number;
  /** Desired overlap between adjacent chunks. Defaults to 120 characters. */
  overlapChars?: number;
  /** Hard cap. No chunk may exceed it. Defaults to 1,100 characters. */
  maxChars?: number;
}
