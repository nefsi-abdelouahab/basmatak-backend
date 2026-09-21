import {
  normalizeLimit,
  encodeCursor,
  decodeCursor,
  buildCursor,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './pagination.util';

describe('pagination util', () => {
  describe('normalizeLimit', () => {
    it('defaults to 20 when absent or invalid', () => {
      expect(normalizeLimit(undefined)).toBe(DEFAULT_LIMIT);
      expect(normalizeLimit('')).toBe(DEFAULT_LIMIT);
      expect(normalizeLimit(null)).toBe(DEFAULT_LIMIT);
      expect(normalizeLimit(0)).toBe(DEFAULT_LIMIT);
      expect(normalizeLimit(-5)).toBe(DEFAULT_LIMIT);
      expect(normalizeLimit('abc')).toBe(DEFAULT_LIMIT);
    });

    it('caps at 50', () => {
      expect(normalizeLimit(51)).toBe(MAX_LIMIT);
      expect(normalizeLimit('500')).toBe(MAX_LIMIT);
    });

    it('passes through valid values', () => {
      expect(normalizeLimit(1)).toBe(1);
      expect(normalizeLimit('20')).toBe(20);
      expect(normalizeLimit(50)).toBe(50);
    });
  });

  describe('cursor encoding', () => {
    it('round-trips a cursor', () => {
      const cursor = encodeCursor('64b000000000000000000000');
      expect(cursor).not.toContain('64b000000000000000000000');
      expect(decodeCursor(cursor)).toBe('64b000000000000000000000');
    });

    it('returns null for missing or malformed cursors', () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor('')).toBeNull();
      expect(decodeCursor('garbage')).toBeNull();
    });

    it('buildCursor emits null without a reference and a cursor with one', () => {
      expect(buildCursor(null)).toEqual({ cursor: null });
      expect(buildCursor('abc')).toEqual({ cursor: encodeCursor('abc') });
    });
  });
});
