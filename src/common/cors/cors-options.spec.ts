import { buildCorsOptions, parseCorsOrigins } from './cors-options';

describe('parseCorsOrigins', () => {
  it('returns an empty allowlist when unset or blank', () => {
    expect(parseCorsOrigins(undefined)).toEqual({
      origins: [],
      droppedWildcard: false,
    });
    expect(parseCorsOrigins('')).toEqual({
      origins: [],
      droppedWildcard: false,
    });
    expect(parseCorsOrigins('   ')).toEqual({
      origins: [],
      droppedWildcard: false,
    });
  });

  it('splits on commas and trims entries', () => {
    expect(
      parseCorsOrigins('https://app.example.com, http://localhost:3000'),
    ).toEqual({
      origins: ['https://app.example.com', 'http://localhost:3000'],
      droppedWildcard: false,
    });
  });

  it('strips trailing slashes so entries match bare origins', () => {
    expect(
      parseCorsOrigins(' https://app.example.com/, http://localhost:3000/ '),
    ).toEqual({
      origins: ['https://app.example.com', 'http://localhost:3000'],
      droppedWildcard: false,
    });
  });

  it('drops empty entries and duplicates', () => {
    expect(
      parseCorsOrigins('http://localhost:3000,,http://localhost:3000,'),
    ).toEqual({
      origins: ['http://localhost:3000'],
      droppedWildcard: false,
    });
  });

  it('drops a bare wildcard and reports it (fail-closed, no wildcard mode)', () => {
    expect(parseCorsOrigins('*')).toEqual({
      origins: [],
      droppedWildcard: true,
    });
    expect(parseCorsOrigins('*, http://localhost:3000/')).toEqual({
      origins: ['http://localhost:3000'],
      droppedWildcard: true,
    });
  });
});

describe('buildCorsOptions', () => {
  it('pins methods, request headers, and exposed download headers', () => {
    const options = buildCorsOptions(['http://localhost:3000']);
    expect(options.origin).toEqual(['http://localhost:3000']);
    const methods = (options.methods as string[]).map((m) => m.toUpperCase());
    for (const method of [
      'GET',
      'HEAD',
      'PUT',
      'PATCH',
      'POST',
      'DELETE',
      'OPTIONS',
    ]) {
      expect(methods).toContain(method);
    }
    const allowed = (options.allowedHeaders as string[]).map((h) =>
      h.toLowerCase(),
    );
    for (const header of ['content-type', 'authorization', 'accept']) {
      expect(allowed).toContain(header);
    }
    expect(options.exposedHeaders).toEqual(['Content-Disposition']);
    expect(options.optionsSuccessStatus).toBe(204);
  });
});
