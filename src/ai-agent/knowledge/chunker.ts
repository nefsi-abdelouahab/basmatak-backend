import {
  KnowledgeBlock,
  KnowledgeChunk,
  KnowledgeChunkOptions,
  KnowledgeDocument,
} from './knowledge.types';

/**
 * Deterministic, dependency-free chunker.
 *
 * Chunks target ~900 characters, overlap by ~120 characters, and never exceed
 * a hard 1,100-character cap. Paragraph and sentence boundaries are preferred;
 * a single sentence longer than the hard cap is split at a word boundary.
 * Blocks with different `group` values (Markdown sections, JSON records, CSV
 * rows) are never merged, so heading metadata stays accurate.
 */

export const DEFAULT_CHUNK_TARGET_CHARS = 900;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 120;
export const DEFAULT_CHUNK_MAX_CHARS = 1100;

interface ResolvedChunkOptions {
  targetChars: number;
  overlapChars: number;
  maxChars: number;
}

interface TextUnit {
  text: string;
  separator: string;
}

interface BlockGroup {
  key: string;
  blocks: KnowledgeBlock[];
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const integer = Math.floor(value);
  return integer > 0 ? integer : fallback;
}

function resolveOptions(
  options: KnowledgeChunkOptions = {},
): ResolvedChunkOptions {
  const targetChars = positiveInteger(
    options.targetChars,
    DEFAULT_CHUNK_TARGET_CHARS,
  );
  const maxChars = Math.max(
    targetChars,
    positiveInteger(options.maxChars, DEFAULT_CHUNK_MAX_CHARS),
  );
  const requestedOverlap =
    options.overlapChars === undefined
      ? DEFAULT_CHUNK_OVERLAP_CHARS
      : Math.max(0, Math.floor(options.overlapChars));
  const overlapChars = Math.min(requestedOverlap, Math.floor(targetChars / 2));

  return { targetChars, overlapChars, maxChars };
}

function groupBlocks(blocks: readonly KnowledgeBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];

  for (const block of blocks) {
    if (!block.text.trim()) continue;
    const key = block.group ?? 'default';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.blocks.push(block);
    } else {
      groups.push({ key, blocks: [block] });
    }
  }

  return groups;
}

function isSentenceTerminator(character: string): boolean {
  return (
    character === '.' ||
    character === '!' ||
    character === '?' ||
    character === '؟'
  );
}

function splitSentences(paragraph: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let index = 0;

  while (index < paragraph.length) {
    const character = paragraph[index];
    if (!isSentenceTerminator(character)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < paragraph.length && /["'”’)\]]/.test(paragraph[end])) {
      end += 1;
    }

    if (end < paragraph.length && !/\s/.test(paragraph[end])) {
      index += 1;
      continue;
    }

    const sentence = paragraph.slice(start, end).trim();
    if (sentence) sentences.push(sentence);

    start = end;
    while (start < paragraph.length && /\s/.test(paragraph[start])) {
      start += 1;
    }
    index = start;
  }

  const rest = paragraph.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

function splitLongUnit(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const pieces: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;

    let piece = remaining.slice(0, cut).trim();
    if (!piece) {
      cut = maxChars;
      piece = remaining.slice(0, cut);
    }
    pieces.push(piece);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) pieces.push(remaining);
  return pieces;
}

function buildUnits(text: string, maxChars: number): TextUnit[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');

  const units: TextUnit[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = splitSentences(paragraph);
    sentences.forEach((sentence, sentenceIndex) => {
      const pieces = splitLongUnit(sentence, maxChars);
      pieces.forEach((piece, pieceIndex) => {
        const isFirstUnit =
          paragraphIndex === 0 && sentenceIndex === 0 && pieceIndex === 0;
        const separator = isFirstUnit
          ? ''
          : sentenceIndex === 0 && pieceIndex === 0
            ? '\n\n'
            : ' ';
        units.push({ text: piece, separator });
      });
    });
  });

  return units;
}

function takeOverlap(text: string, limit: number): string {
  if (limit <= 0 || text === '') return '';

  let slice = text.length <= limit ? text : text.slice(text.length - limit);
  const firstSpace = slice.search(/\s/);
  if (firstSpace >= 0 && firstSpace < slice.length - 1) {
    slice = slice.slice(firstSpace + 1);
  }
  return slice.trim();
}

function chunkText(text: string, options: ResolvedChunkOptions): string[] {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized === '') return [];

  const units = buildUnits(normalized, options.maxChars);
  if (units.length === 0) return [];

  const chunks: string[] = [];
  let current = '';
  let hasNewContent = false;
  let previousChunk = '';

  const flush = (): void => {
    const trimmed = current.trim();
    if (hasNewContent && trimmed !== '') {
      chunks.push(trimmed);
      previousChunk = trimmed;
    }
    current = '';
    hasNewContent = false;
  };

  const startWithOverlap = (unit: TextUnit): void => {
    const overlapLimit = Math.min(
      options.overlapChars,
      Math.floor(previousChunk.length / 2),
    );
    const overlap = takeOverlap(previousChunk, overlapLimit);
    const separator =
      overlap === '' ? '' : unit.separator === '\n\n' ? '\n\n' : ' ';

    let candidate = `${overlap}${separator}${unit.text}`;
    if (candidate.length > options.maxChars) {
      const allowed = Math.max(0, options.maxChars - unit.text.length - 1);
      const trimmedOverlap = takeOverlap(previousChunk, allowed);
      candidate =
        trimmedOverlap === '' ? unit.text : `${trimmedOverlap} ${unit.text}`;
    }

    current = candidate;
    hasNewContent = true;
  };

  for (const unit of units) {
    const separator =
      current === '' ? '' : unit.separator === '\n\n' ? '\n\n' : ' ';
    const candidate = `${current}${separator}${unit.text}`;
    const fitsTarget = candidate.length <= options.targetChars;
    const fitsMax = candidate.length <= options.maxChars;
    const currentBelowTarget = current.length < options.targetChars;
    const smallUnit = unit.text.length <= options.overlapChars;

    if (fitsTarget || (fitsMax && (currentBelowTarget || smallUnit))) {
      current = candidate;
      hasNewContent = true;
      continue;
    }

    flush();
    startWithOverlap(unit);
  }

  flush();
  return chunks;
}

/**
 * Chunk one parsed document. Empty documents produce zero chunks.
 */
export function chunkKnowledgeDocument(
  document: KnowledgeDocument,
  options: KnowledgeChunkOptions = {},
): KnowledgeChunk[] {
  const resolved = resolveOptions(options);
  const source = document.source.replace(/\\/g, '/');
  const documentText = document.text ?? '';
  const sourceBlocks = document.blocks ?? [];
  const blocks =
    sourceBlocks.length > 0
      ? sourceBlocks
      : documentText.trim() !== ''
        ? [
            {
              text: documentText,
              headingTrail: [],
              group: 'document',
            },
          ]
        : [];

  const chunks: KnowledgeChunk[] = [];

  for (const group of groupBlocks(blocks)) {
    const text = group.blocks
      .map((block) => block.text)
      .join('\n\n')
      .trim();
    if (text === '') continue;

    const headingTrail = group.blocks[0]?.headingTrail ?? [];

    for (const piece of chunkText(text, resolved)) {
      const ordinal = chunks.length + 1;
      chunks.push({
        id: `${source}#${ordinal}`,
        source,
        ordinal,
        headingTrail: [...headingTrail],
        text: piece,
        charCount: piece.length,
        title: document.title,
        locale: document.locale,
        tags: [...(document.tags ?? [])],
        priority: document.priority,
      });
    }
  }

  return chunks;
}

/** Chunk multiple documents in input order. */
export function chunkKnowledgeDocuments(
  documents: readonly KnowledgeDocument[],
  options: KnowledgeChunkOptions = {},
): KnowledgeChunk[] {
  return documents.flatMap((document) =>
    chunkKnowledgeDocument(document, options),
  );
}

/** Thin Nest provider wrapper; no indexing or retrieval is performed. */
export class KnowledgeChunker {
  constructor(private readonly options: KnowledgeChunkOptions = {}) {}

  chunk(document: KnowledgeDocument): KnowledgeChunk[] {
    return chunkKnowledgeDocument(document, this.options);
  }

  chunkAll(documents: readonly KnowledgeDocument[]): KnowledgeChunk[] {
    return chunkKnowledgeDocuments(documents, this.options);
  }
}
