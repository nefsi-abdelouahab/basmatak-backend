import * as fs from 'fs';
import * as path from 'path';
import {
  KnowledgeDocument,
  KnowledgeFormat,
  KnowledgeParseInput,
  KnowledgeParseResult,
} from './knowledge.types';
import { parseKnowledgeDocument } from './parser';

const FIXTURES = path.join(__dirname, '__fixtures__');

function fixture(...parts: string[]): string {
  return fs.readFileSync(path.join(FIXTURES, ...parts), 'utf8');
}

function parse(input: KnowledgeParseInput): KnowledgeParseResult {
  return parseKnowledgeDocument(input);
}

function documentOf(input: KnowledgeParseInput): KnowledgeDocument {
  const result = parse(input);
  expect(result.issues).toEqual([]);
  if (!result.document) throw new Error('Expected a parsed document');
  return result.document;
}

function issueCodes(result: KnowledgeParseResult): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('KnowledgeParser', () => {
  describe('Markdown front matter and blocks', () => {
    it('parses title, locale, tags, priority, headings, and heading trails', () => {
      const document = documentOf({
        source: 'faq/guide.en.md',
        format: 'md',
        text: fixture('valid', 'guide.en.md'),
      });

      expect(document.title).toBe('Volunteer guide');
      expect(document.locale).toBe('en');
      expect(document.tags).toEqual(['volunteering', 'applications']);
      expect(document.priority).toBe(2);
      expect(document.format).toBe('md');
      expect(document.source).toBe('faq/guide.en.md');
      expect(document.text).toContain('# Volunteer guide');
      expect(document.text).not.toContain('title: Volunteer guide');
      expect(document.headings?.map((heading) => heading.level)).toEqual([
        1, 2, 3, 2,
      ]);

      const applying = document.blocks.find((block) =>
        block.headingTrail.includes('Applying'),
      );
      expect(applying?.headingTrail).toEqual(['Volunteer guide', 'Applying']);
      expect(applying?.headingPath?.map((heading) => heading.level)).toEqual([
        1, 2,
      ]);

      const evidence = document.blocks.find((block) =>
        block.headingTrail.includes('Evidence'),
      );
      expect(evidence?.text).toContain('- Submit a clear photo');
      expect(evidence?.text).toContain('\n- Wait for the organization');

      for (const block of document.blocks) {
        expect(block.text.startsWith('#')).toBe(false);
      }
    });

    it('parses block-list tags with quoted values', () => {
      const document = documentOf({
        source: 'guides/guide.fr.md',
        format: 'md',
        text: fixture('valid', 'guide-block-tags.md'),
      });

      expect(document.title).toBe('Guide des bénévoles');
      expect(document.locale).toBe('fr');
      expect(document.tags).toEqual(['bénévolat', 'opportunité']);
      expect(document.priority).toBe(4);
    });

    it('falls back safely for missing or invalid optional front matter', () => {
      const document = documentOf({
        source: 'faq/ar/fallback.md',
        format: 'md',
        text: fixture('valid', 'fallback.md'),
      });

      expect(document.title).toBe('Fallback heading');
      expect(document.locale).toBe('ar');
      expect(document.tags).toEqual([]);
      expect(document.priority).toBe(3);
    });

    it('derives the title from the first H1 and the locale from the path', () => {
      const fromHeading = documentOf({
        source: 'guides/verification.en.md',
        format: 'md',
        text: '# Verification\n\nBody.',
      });
      expect(fromHeading.title).toBe('Verification');
      expect(fromHeading.locale).toBe('en');

      const fromParent = documentOf({
        source: 'faq/ar/guide.md',
        format: 'md',
        text: 'Body without a heading.',
      });
      expect(fromParent.title).toBe('guide');
      expect(fromParent.locale).toBe('ar');

      const fromSuffix = documentOf({
        source: 'faq/verification.fr.md',
        format: 'md',
        text: 'Body without a heading.',
      });
      expect(fromSuffix.title).toBe('verification');
      expect(fromSuffix.locale).toBe('fr');
    });

    it('ignores unknown front matter keys and uses the last duplicate value', () => {
      const document = documentOf({
        source: 'faq/known.md',
        format: 'md',
        text: [
          '---',
          'title: First title',
          'title: Second title',
          'locale: en',
          'tags: []',
          'priority: 1',
          'unknown: value',
          '---',
          '',
          '# Second title',
          '',
          'Body.',
        ].join('\n'),
      });

      expect(document.title).toBe('Second title');
      expect(document.priority).toBe(1);
      expect(document.tags).toEqual([]);
    });

    it('does not treat headings inside fenced code as document headings', () => {
      const document = documentOf({
        source: 'guides/fence.md',
        format: 'md',
        text: [
          '# Real heading',
          '',
          '```',
          '# Not a heading',
          '```',
          '',
          'Body.',
        ].join('\n'),
      });

      expect(document.headings?.map((heading) => heading.text)).toEqual([
        'Real heading',
      ]);
      expect(document.blocks[0].text).toContain('# Not a heading');
    });

    it('fails closed on malformed front matter', () => {
      const malformed = parse({
        source: 'faq/malformed.md',
        format: 'md',
        text: fixture('invalid', 'malformed-front-matter.md'),
      });
      expect(malformed.document).toBeNull();
      expect(issueCodes(malformed)).toContain('MALFORMED_FRONT_MATTER');

      const invalid = parse({
        source: 'faq/invalid.md',
        format: 'md',
        text: fixture('invalid', 'invalid-front-matter.md'),
      });
      expect(invalid.document).toBeNull();
      expect(issueCodes(invalid)).toContain('INVALID_FRONT_MATTER');
    });

    it('returns an empty document for empty Markdown', () => {
      const document = documentOf({
        source: 'empty.md',
        format: 'md',
        text: '',
      });

      expect(document.title).toBe('empty');
      expect(document.locale).toBe('en');
      expect(document.text).toBe('');
      expect(document.blocks).toEqual([]);
      expect(document.headings).toEqual([]);
    });
  });

  describe('TXT parsing', () => {
    it('uses paragraphs and keeps an empty heading trail', () => {
      const document = documentOf({
        source: 'guides/notes.txt',
        format: 'txt',
        text: fixture('valid', 'notes.txt'),
      });

      expect(document.title).toBe('Notes for volunteers');
      expect(document.locale).toBe('en');
      expect(document.format).toBe('txt');
      expect(document.blocks).toHaveLength(3);
      expect(document.blocks[0].text).toBe('# Notes for volunteers');
      expect(document.blocks[1].text).toContain('First paragraph');
      expect(
        document.blocks.every((block) => block.headingTrail.length === 0),
      ).toBe(true);
    });

    it('removes front matter from TXT and uses it for metadata', () => {
      const document = documentOf({
        source: 'notes.txt',
        format: 'txt',
        text: [
          '---',
          'title: TXT title',
          'locale: fr',
          'tags: []',
          'priority: 2',
          '---',
          '',
          '# TXT heading',
          '',
          'Body.',
        ].join('\n'),
      });

      expect(document.title).toBe('TXT title');
      expect(document.locale).toBe('fr');
      expect(document.priority).toBe(2);
      expect(document.text).not.toContain('---');
      expect(document.blocks[0].headingTrail).toEqual([]);
    });
  });

  describe('JSON parsing', () => {
    it('turns arrays of objects into records with indexed key paths', () => {
      const document = documentOf({
        source: 'data/topics.json',
        format: 'json',
        text: fixture('valid', 'topics.json'),
      });

      expect(document.title).toBe('topics');
      expect(document.locale).toBe('en');
      expect(document.blocks).toHaveLength(2);
      expect(document.blocks[0].group).toBe('root:0');
      expect(document.blocks[0].text).toContain(
        '[0].title_en: Finding volunteer opportunities',
      );
      expect(document.blocks[0].text).toContain('[0].summary_ar: تصفح');
      expect(document.blocks[0].text).not.toContain('active:');
      expect(document.blocks[0].text).not.toContain('rank:');
      expect(document.blocks[0].text).not.toContain('notes:');
      expect(document.blocks[1].text).toContain(
        '[1].title_en: Applying and participating',
      );
    });

    it('flattens arrays of strings with indexed key paths', () => {
      const document = documentOf({
        source: 'data/strings.json',
        format: 'json',
        text: fixture('valid', 'strings.json'),
      });

      expect(document.blocks).toHaveLength(2);
      expect(document.blocks[0].text).toBe('tips[0]: Read the guide.');
      expect(document.blocks[1].text).toBe('tips[1]: Ask for help.');
    });

    it('reads optional top-level metadata without indexing it as content', () => {
      const document = documentOf({
        source: 'data/metadata.json',
        format: 'json',
        text: fixture('valid', 'metadata.json'),
      });

      expect(document.title).toBe('Platform topics');
      expect(document.locale).toBe('fr');
      expect(document.blocks).toHaveLength(2);
      expect(document.text).toContain('topics[0].title: Bénévolat');
      expect(document.text).toContain('tags[0]: plateforme');
      expect(document.text).not.toContain('Platform topics');
    });

    it('parses a top-level string as one block', () => {
      const document = documentOf({
        source: 'data/string.json',
        format: 'json',
        text: '"Hello world."',
      });

      expect(document.blocks).toHaveLength(1);
      expect(document.text).toBe('Hello world.');
    });

    it('fails closed on malformed JSON and invalid metadata', () => {
      const malformed = parse({
        source: 'data/malformed.json',
        format: 'json',
        text: fixture('invalid', 'malformed.json'),
      });
      expect(malformed.document).toBeNull();
      expect(issueCodes(malformed)).toContain('INVALID_JSON');

      const badTitle = parse({
        source: 'data/bad-title.json',
        format: 'json',
        text: '{"title": 5}',
      });
      expect(badTitle.document).toBeNull();
      expect(issueCodes(badTitle)).toContain('INVALID_JSON_METADATA');

      const badLocale = parse({
        source: 'data/bad-locale.json',
        format: 'json',
        text: '{"locale": "de"}',
      });
      expect(badLocale.document).toBeNull();
      expect(issueCodes(badLocale)).toContain('INVALID_JSON_METADATA');
    });

    it('enforces the 10-level JSON depth limit', () => {
      let allowed: unknown = 'leaf';
      for (let index = 0; index < 10; index += 1) {
        allowed = { level: allowed };
      }
      const allowedResult = parse({
        source: 'data/allowed.json',
        format: 'json',
        text: JSON.stringify(allowed),
      });
      expect(allowedResult.issues).toEqual([]);
      expect(allowedResult.document).not.toBeNull();

      let blocked: unknown = 'leaf';
      for (let index = 0; index < 11; index += 1) {
        blocked = { level: blocked };
      }
      const blockedResult = parse({
        source: 'data/blocked.json',
        format: 'json',
        text: JSON.stringify(blocked),
      });
      expect(blockedResult.document).toBeNull();
      expect(issueCodes(blockedResult)).toContain('JSON_TOO_DEEP');

      const fixtureResult = parse({
        source: 'data/too-deep.json',
        format: 'json',
        text: fixture('invalid', 'too-deep.json'),
      });
      expect(fixtureResult.document).toBeNull();
      expect(issueCodes(fixtureResult)).toContain('JSON_TOO_DEEP');
    });
  });

  describe('CSV parsing', () => {
    it('parses quoted fields, escaped quotes, and one record per row', () => {
      const document = documentOf({
        source: 'data/glossary.csv',
        format: 'csv',
        text: fixture('valid', 'glossary.csv'),
      });

      expect(document.title).toBe('glossary');
      expect(document.locale).toBe('en');
      expect(document.blocks).toHaveLength(2);
      expect(document.blocks[0].group).toBe('row:2');
      expect(document.blocks[0].text).toContain('term_en: opportunity');
      expect(document.blocks[0].text).toContain(
        'definition_en: A published volunteer task, with positions and dates.',
      );
      expect(document.blocks[1].text).toContain('including "evidence" review');
    });

    it('uses the first non-empty row as the header', () => {
      const document = documentOf({
        source: 'data/leading.csv',
        format: 'csv',
        text: '\n\nterm,definition\nx,y\n',
      });

      expect(document.blocks).toHaveLength(1);
      expect(document.blocks[0].text).toContain('term: x');
      expect(document.blocks[0].text).toContain('definition: y');
    });

    it('fails closed on formula-leading cells', () => {
      const result = parse({
        source: 'data/formula.csv',
        format: 'csv',
        text: fixture('invalid', 'formula.csv'),
      });

      expect(result.document).toBeNull();
      expect(issueCodes(result)).toContain('CSV_FORMULA_INJECTION');
    });

    it('fails closed on malformed CSV shapes', () => {
      const mismatch = parse({
        source: 'data/mismatch.csv',
        format: 'csv',
        text: fixture('invalid', 'column-mismatch.csv'),
      });
      expect(mismatch.document).toBeNull();
      expect(issueCodes(mismatch)).toContain('INVALID_CSV');

      const unclosed = parse({
        source: 'data/unclosed.csv',
        format: 'csv',
        text: fixture('invalid', 'unclosed-quote.csv'),
      });
      expect(unclosed.document).toBeNull();
      expect(issueCodes(unclosed)).toContain('INVALID_CSV');

      const empty = parse({
        source: 'data/empty.csv',
        format: 'csv',
        text: '',
      });
      expect(empty.document).toBeNull();
      expect(issueCodes(empty)).toContain('INVALID_CSV');
    });
  });

  it('rejects an unsupported format', () => {
    const result = parse({
      source: 'file.pdf',
      format: 'pdf' as KnowledgeFormat,
      text: '',
    });

    expect(result.document).toBeNull();
    expect(issueCodes(result)).toContain('UNSUPPORTED_FORMAT');
  });
});
