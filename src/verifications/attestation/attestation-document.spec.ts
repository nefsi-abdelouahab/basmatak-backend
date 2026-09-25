import {
  AttestationData,
  buildAttestationDocument,
} from './attestation-document';

const CIVIC_TOKENS = [
  'Civic',
  'Sovereign',
  'Ledger',
  'Statute',
  'Accredited',
  'DZ-',
  'ALG-',
  'TCA-',
  'SHA-256',
];

function fixtureData(): AttestationData {
  return {
    lang: 'en',
    platformName: 'Basmatak Tatatoua',
    volunteerName: 'Ali Ben',
    volunteerRegistryId: 'VOL-000042',
    experienceTitle: 'Park, Lake Cleanup',
    experienceDescription: 'Collected litter along the shore',
    experienceRegistryId: 'EXP-000123',
    verificationCode: 'ABCDEFGH',
    durationMinutes: 180,
    verifiedOn: '2026-09-05',
    organizationName: 'Association El-Amel',
    organizationSlug: 'el-amel',
    organizationRegistryId: 'ORG-000007',
    positionTitle: 'Shoreline volunteer',
    deliverables: ['Plant 20 seedlings', 'Collect 12 bags'],
    skillNames: ['Teamwork'],
  };
}

/**
 * Extracts rendered text from the uncompressed PDF bytes. pdfkit hex-encodes
 * content-stream text (`<455850…>` = WinAnsi hex), so raw `includes` checks
 * miss; decoding the hex tokens recovers the strings. Latin-script only —
 * Arabic-script fidelity is a flagged follow-up, not asserted here.
 */
function extractText(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const tokens = raw.match(/<[0-9A-Fa-f]+>/g) ?? [];
  return tokens
    .map((token) => Buffer.from(token.slice(1, -1), 'hex').toString('latin1'))
    .join('');
}

function renderToBuffer(data: AttestationData): Promise<Buffer> {
  const document = buildAttestationDocument(data);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', (error: unknown) => reject(error));
    document.end();
  });
}

describe('buildAttestationDocument (Session 18)', () => {
  it('renders a non-empty PDF carrying the real registry identity', async () => {
    const bytes = await renderToBuffer(fixtureData());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const text = extractText(bytes);
    expect(text).toContain('Certificate of Verified Experience');
    expect(text).toContain('Basmatak Tatatoua');
    expect(text).toContain('Ali Ben');
    expect(text).toContain('VOL-000042');
    expect(text).toContain('Park, Lake Cleanup');
    expect(text).toContain('Association El-Amel');
    expect(text).toContain('el-amel');
    expect(text).toContain('ORG-000007');
    expect(text).toContain('EXP-000123');
    expect(text).toContain('ABCDEFGH');
    expect(text).toContain('180');
    expect(text).toContain('2026-09-05');
    expect(text).toContain('Verified by');
  });

  it('contains no civic-narrative or fabricated-registry content', async () => {
    const text = extractText(await renderToBuffer(fixtureData()));
    for (const token of CIVIC_TOKENS) {
      expect(text).not.toContain(token);
    }
  });

  it('omits optional blocks when absent', async () => {
    const bytes = await renderToBuffer({
      ...fixtureData(),
      experienceDescription: null,
      positionTitle: null,
      deliverables: [],
      skillNames: [],
    });
    expect(bytes.length).toBeGreaterThan(0);
    expect(extractText(bytes)).toContain('EXP-000123');
  });

  it('builds the Arabic variant without throwing (fidelity deferred)', async () => {
    const bytes = await renderToBuffer({ ...fixtureData(), lang: 'ar' });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
