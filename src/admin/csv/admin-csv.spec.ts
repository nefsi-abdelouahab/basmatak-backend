import { ADMIN_CSV_LISTS, adminCsvToString } from './admin-csv';

describe('admin CSV export (Session 10)', () => {
  it('emits a header row plus one row per record', async () => {
    const csv = await adminCsvToString('users', [
      {
        _id: { toString: () => 'u1' },
        email: 'a@example.com',
        role: 'volunteer',
        status: 'active',
      },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'id,email,phone,role,status,lastActivityAt,createdAt',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('a@example.com');
  });

  it('escapes commas, quotes, and newlines per RFC 4180', async () => {
    const csv = await adminCsvToString('reports', [
      {
        _id: { toString: () => 'r1' },
        title: 'Bad, "quoted"\ntitle',
        targetType: 'user',
        targetId: { toString: () => 't1' },
        priority: 'high',
        status: 'open',
      },
    ]);
    // The raw title must not appear unescaped; the quoted form must round-trip.
    expect(csv).not.toContain('Bad, "quoted"');
    expect(csv).toContain('"Bad, ""quoted""\ntitle"');
  });

  it('lists expose the owner-confirmed column sets', () => {
    expect(ADMIN_CSV_LISTS.users.columns.map((c) => c.key)).toEqual([
      'id',
      'email',
      'phone',
      'role',
      'status',
      'lastActivityAt',
      'createdAt',
    ]);
    expect(ADMIN_CSV_LISTS['audit-logs'].columns.map((c) => c.key)).toContain(
      'actorName',
    );
  });

  it('renders an empty page as headers only', async () => {
    const csv = await adminCsvToString('opportunities', []);
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});
