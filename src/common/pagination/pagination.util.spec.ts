import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  normalizeLimit,
  encodeCursor,
  decodeCursor,
  buildCursor,
  toArray,
  encodePageCursor,
  decodePageCursor,
  execPage,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './pagination.util';
import {
  OpportunityFeedQueryDto,
  OwnOpportunityQueryDto,
} from '../../opportunities/dto/opportunity.dto';
import { TalentsQueryDto } from '../../volunteers/dto/talents.dto';
import {
  ApplicationListQueryDto,
  OrganizationApplicationsQueryDto,
} from '../../applications/dto/application.dto';
import { SubmissionListQueryDto } from '../../submissions/dto/submission.dto';

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

  describe('toArray (comma-separated multi-value parsing)', () => {
    it('returns [] for absent input', () => {
      expect(toArray(undefined)).toEqual([]);
      expect(toArray(null)).toEqual([]);
    });

    it('splits comma-separated values, trims, drops empties and dedupes', () => {
      expect(toArray('a,b, c ,,a')).toEqual(['a', 'b', 'c']);
      expect(toArray(['x,y', 'z', 'x'])).toEqual(['x', 'y', 'z']);
      expect(toArray('single')).toEqual(['single']);
    });
  });

  describe('page cursor', () => {
    it('round-trips id, page, sort and value', () => {
      const cursor = encodePageCursor({
        id: '64b000000000000000000000',
        page: 3,
        sort: 'deadline_asc',
        value: '2026-01-01T00:00:00.000Z',
      });
      expect(decodePageCursor(cursor)).toEqual({
        id: '64b000000000000000000000',
        page: 3,
        sort: 'deadline_asc',
        value: '2026-01-01T00:00:00.000Z',
      });
    });

    it('treats legacy cursors as page 2', () => {
      const legacy = encodeCursor('64b000000000000000000000');
      expect(decodePageCursor(legacy)).toEqual({
        id: '64b000000000000000000000',
        page: 2,
      });
    });

    it('returns null for missing or malformed cursors', () => {
      expect(decodePageCursor(undefined)).toBeNull();
      expect(decodePageCursor('')).toBeNull();
      expect(decodePageCursor('garbage')).toBeNull();
    });
  });

  describe('execPage (counted cursor metadata)', () => {
    function mockModel(total: number, rowsInIdOrder: string[]) {
      const findResult = (filter: Record<string, unknown>) => {
        let rows = rowsInIdOrder;
        const idConstraint = filter._id as
          { $lt?: Types.ObjectId; $gt?: Types.ObjectId } | undefined;
        if (idConstraint?.$lt) {
          const bound = idConstraint.$lt.toString();
          rows = rows.filter((id) => id < bound);
        } else if (idConstraint?.$gt) {
          const bound = idConstraint.$gt.toString();
          rows = rows.filter((id) => id > bound);
        }
        return rows;
      };
      return {
        countDocuments: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(total),
        }),
        find: jest
          .fn()
          .mockImplementation((filter: Record<string, unknown>) => {
            const rows = findResult(filter);
            return {
              sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockImplementation((n: number) => ({
                  exec: jest
                    .fn()
                    .mockResolvedValue(
                      rows
                        .slice(0, n)
                        .map((id) => ({ _id: new Types.ObjectId(id) })),
                    ),
                })),
              }),
            };
          }),
      } as never;
    }

    it('computes total/page/pages with a non-even final page', async () => {
      const ids = [
        '64b000000000000000000007',
        '64b000000000000000000006',
        '64b000000000000000000005',
        '64b000000000000000000004',
        '64b000000000000000000003',
      ];
      const model = mockModel(5, ids);
      const first = await execPage(
        model,
        {},
        {
          limit: 2,
          sort: { _id: -1 },
          sortToken: 'newest',
        },
      );
      expect(first.total).toBe(5);
      expect(first.page).toBe(1);
      expect(first.pages).toBe(3);
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await execPage(
        model,
        {},
        {
          limit: 2,
          cursor: first.nextCursor as string,
          sort: { _id: -1 },
          sortToken: 'newest',
        },
      );
      expect(second.total).toBe(5);
      expect(second.pages).toBe(3);
      expect(second.page).toBe(2);

      const third = await execPage(
        model,
        {},
        {
          limit: 2,
          cursor: second.nextCursor as string,
          sort: { _id: -1 },
          sortToken: 'newest',
        },
      );
      // Final partial page: 1 item, no next cursor, metadata still complete.
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();
      expect(third.total).toBe(5);
      expect(third.page).toBe(3);
      expect(third.pages).toBe(3);
    });

    it('counts the base filter, ignoring only cursor position', async () => {
      const ids = [
        '64b000000000000000000003',
        '64b000000000000000000002',
        '64b000000000000000000001',
      ];
      const model = mockModel(3, ids);
      const cursor = encodePageCursor({ id: ids[0], page: 2 });
      const page = await execPage(
        model,
        { status: 'published' },
        { limit: 2, cursor, sort: { _id: -1 }, sortToken: 'newest' },
      );
      expect(
        (model as unknown as { countDocuments: jest.Mock }).countDocuments.mock
          .calls[0][0],
      ).toEqual({ status: 'published' });
      expect(page.total).toBe(3);
      expect(page.pages).toBe(2);
    });
  });

  describe('sort whitelist validation', () => {
    async function errorsFor(dto: object, cls: new () => object) {
      return validate(plainToInstance(cls, dto), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
    }

    it('rejects unapproved feed sort tokens', async () => {
      expect(
        await errorsFor({ sort: 'nope' }, OpportunityFeedQueryDto),
      ).not.toHaveLength(0);
      expect(
        await errorsFor({ sort: 'newest' }, OpportunityFeedQueryDto),
      ).toHaveLength(0);
    });

    it('rejects unapproved talents/inbox/submission sort tokens', async () => {
      expect(
        await errorsFor({ sort: 'nope' }, TalentsQueryDto),
      ).not.toHaveLength(0);
      expect(
        await errorsFor({ sort: 'experiences_desc' }, TalentsQueryDto),
      ).toHaveLength(0);
      expect(
        await errorsFor({ sort: 'nope' }, OrganizationApplicationsQueryDto),
      ).not.toHaveLength(0);
      expect(
        await errorsFor({ sort: 'oldest' }, OrganizationApplicationsQueryDto),
      ).toHaveLength(0);
      expect(
        await errorsFor({ sort: 'nope' }, SubmissionListQueryDto),
      ).not.toHaveLength(0);
      expect(
        await errorsFor(
          { sort: 'newest', format: 'bogus' },
          SubmissionListQueryDto,
        ),
      ).not.toHaveLength(0);
      expect(
        await errorsFor(
          { sort: 'newest', format: 'image' },
          SubmissionListQueryDto,
        ),
      ).toHaveLength(0);
    });

    it('rejects unapproved own-opportunity and volunteer-application params', async () => {
      expect(
        await errorsFor({ sort: 'nope' }, OwnOpportunityQueryDto),
      ).not.toHaveLength(0);
      expect(
        await errorsFor(
          { status: 'pending', from: 'not-a-date' },
          ApplicationListQueryDto,
        ),
      ).not.toHaveLength(0);
    });
  });
});
