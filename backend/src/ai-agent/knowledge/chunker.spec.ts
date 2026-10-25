import {
  DEFAULT_CHUNK_MAX_CHARS,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_CHUNK_TARGET_CHARS,
  KnowledgeChunker,
  chunkKnowledgeDocument,
  chunkKnowledgeDocuments,
} from './chunker';
import { KnowledgeDocument } from './knowledge.types';

function makeDocument(
  overrides: Partial<KnowledgeDocument> = {},
): KnowledgeDocument {
  return {
    source: 'faq/en.md',
    format: 'md',
    title: 'FAQ',
    locale: 'en',
    tags: ['faq'],
    priority: 2,
    text: '',
    blocks: [],
    ...overrides,
  };
}

function overlapLength(previous: string, next: string): number {
  const limit = Math.min(
    DEFAULT_CHUNK_OVERLAP_CHARS,
    previous.length,
    next.length,
  );
  for (let length = limit; length > 0; length -= 1) {
    if (previous.endsWith(next.slice(0, length))) return length;
  }
  return 0;
}

describe('KnowledgeChunker', () => {
  it('keeps a short document in one deterministic chunk with metadata', () => {
    const document = makeDocument({
      text: '# Title\n\nA short paragraph.',
      blocks: [
        {
          text: 'A short paragraph.',
          headingTrail: ['Title'],
          group: 'section:1',
        },
      ],
    });

    const chunks = chunkKnowledgeDocument(document);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      id: 'faq/en.md#1',
      source: 'faq/en.md',
      ordinal: 1,
      headingTrail: ['Title'],
      text: 'A short paragraph.',
      title: 'FAQ',
      locale: 'en',
      tags: ['faq'],
      priority: 2,
    });
    expect(chunks[0].charCount).toBe(chunks[0].text.length);
  });

  it('returns no chunks for an empty document', () => {
    expect(chunkKnowledgeDocument(makeDocument())).toEqual([]);
    expect(chunkKnowledgeDocument(makeDocument({ text: '   \n\n  ' }))).toEqual(
      [],
    );
  });

  it('uses document text when no blocks were supplied', () => {
    const chunks = chunkKnowledgeDocument(
      makeDocument({ text: 'A standalone text.' }),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('A standalone text.');
  });

  it('targets roughly 900 characters, stays under the hard cap, and overlaps adjacent chunks', () => {
    const sentences = Array.from(
      { length: 40 },
      (_, index) =>
        `Rule ${index + 1} explains a distinct part of volunteering in Algeria.`,
    );
    const text = sentences.join(' ');
    const document = makeDocument({
      text,
      blocks: [{ text, headingTrail: ['Rules'], group: 'section:1' }],
    });

    const chunks = chunkKnowledgeDocument(document);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.some((chunk) => chunk.text.length >= 700)).toBe(true);

    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_CHARS);
      expect(chunk.text.endsWith('.')).toBe(true);
      expect(chunk.headingTrail).toEqual(['Rules']);
    }

    for (let index = 1; index < chunks.length; index += 1) {
      expect(
        overlapLength(chunks[index - 1].text, chunks[index].text),
      ).toBeGreaterThanOrEqual(60);
    }

    expect(DEFAULT_CHUNK_TARGET_CHARS).toBe(900);
    expect(DEFAULT_CHUNK_OVERLAP_CHARS).toBe(120);
    expect(DEFAULT_CHUNK_MAX_CHARS).toBe(1100);
  });

  it('hard-splits a single sentence longer than the cap', () => {
    const sentence = `${'word '.repeat(500).trim()}.`;
    const document = makeDocument({
      text: sentence,
      blocks: [
        { text: sentence, headingTrail: ['Long rule'], group: 'section:1' },
      ],
    });

    const chunks = chunkKnowledgeDocument(document);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_CHARS);
    }
  });

  it('never merges blocks from different heading groups', () => {
    const document = makeDocument({
      blocks: [
        {
          text: 'Section one text.',
          headingTrail: ['Guide', 'One'],
          group: 'section:1',
        },
        {
          text: 'Section two text.',
          headingTrail: ['Guide', 'Two'],
          group: 'section:2',
        },
      ],
    });

    const chunks = chunkKnowledgeDocument(document);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingTrail).toEqual(['Guide', 'One']);
    expect(chunks[1].headingTrail).toEqual(['Guide', 'Two']);
    expect(chunks[1].text).not.toContain('Section one');
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([1, 2]);
  });

  it('keeps one chunk per structured record group', () => {
    const document = makeDocument({
      format: 'csv',
      blocks: [
        {
          text: 'term_en: opportunity',
          headingTrail: [],
          group: 'row:2',
        },
        {
          text: 'term_en: verification',
          headingTrail: [],
          group: 'row:3',
        },
      ],
    });

    const chunks = chunkKnowledgeDocument(document);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('term_en: opportunity');
    expect(chunks[1].text).toBe('term_en: verification');
    expect(chunks.map((chunk) => chunk.id)).toEqual([
      'faq/en.md#1',
      'faq/en.md#2',
    ]);
  });

  it('is deterministic', () => {
    const text = Array.from(
      { length: 30 },
      (_, index) =>
        `Sentence ${index + 1} describes a separate rule for volunteers.`,
    ).join(' ');
    const document = makeDocument({
      text,
      blocks: [{ text, headingTrail: ['Rules'], group: 'section:1' }],
    });

    expect(chunkKnowledgeDocument(document)).toEqual(
      chunkKnowledgeDocument(document),
    );
  });

  it('honours custom target, overlap, and hard-cap options', () => {
    const text = Array.from(
      { length: 20 },
      (_, index) => `Sentence ${index + 1} has enough words to matter here.`,
    ).join(' ');
    const document = makeDocument({
      text,
      blocks: [{ text, headingTrail: ['Rules'], group: 'section:1' }],
    });

    const chunks = chunkKnowledgeDocument(document, {
      targetChars: 200,
      overlapChars: 40,
      maxChars: 260,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(260);
    }
    for (let index = 1; index < chunks.length; index += 1) {
      let overlap = 0;
      const previous = chunks[index - 1].text;
      const next = chunks[index].text;
      for (
        let length = Math.min(40, previous.length, next.length);
        length > 0;
        length -= 1
      ) {
        if (previous.endsWith(next.slice(0, length))) {
          overlap = length;
          break;
        }
      }
      expect(overlap).toBeGreaterThan(0);
    }
  });

  it('chunks multiple documents in input order', () => {
    const first = makeDocument({
      source: 'a.md',
      blocks: [{ text: 'First.', headingTrail: [], group: 'section:1' }],
    });
    const second = makeDocument({
      source: 'b.md',
      blocks: [{ text: 'Second.', headingTrail: [], group: 'section:1' }],
    });

    const chunks = chunkKnowledgeDocuments([first, second]);

    expect(chunks.map((chunk) => chunk.id)).toEqual(['a.md#1', 'b.md#1']);
  });

  it('exposes a reusable provider wrapper', () => {
    const document = makeDocument({
      blocks: [
        {
          text: 'A short provider paragraph.',
          headingTrail: ['Provider'],
          group: 'section:1',
        },
      ],
    });
    const chunker = new KnowledgeChunker({
      targetChars: 100,
      overlapChars: 20,
      maxChars: 150,
    });

    const chunks = chunker.chunk(document);

    expect(chunks).toHaveLength(1);
    expect(chunker.chunkAll([document])).toEqual(chunks);
  });
});
