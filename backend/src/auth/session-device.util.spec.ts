import { parseUserAgent } from './session-device.util';

describe('parseUserAgent (org-ops session device metadata)', () => {
  it('classifies a desktop Chrome UA into browser and OS', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(result.userAgent).toContain('Chrome');
    expect(result.device).toMatchObject({ browser: 'Chrome', os: 'Windows' });
    expect(result.device!.device).toBeUndefined();
  });

  it('classifies an Android Chrome UA as browser, OS and mobile device', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    );
    expect(result.device).toMatchObject({
      browser: 'Chrome',
      os: 'Android',
      device: 'mobile',
    });
  });

  it('classifies an iPhone Safari UA as iOS and iPhone', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(result.device).toMatchObject({
      browser: 'Safari',
      os: 'iOS',
      device: 'iPhone',
    });
  });

  it('ranks Edge before Chrome inside MS Edge user agents', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    );
    expect(result.device!.browser).toBe('Edge');
  });

  it('returns device null for an absent or unparseable header', () => {
    expect(parseUserAgent(undefined)).toEqual({
      device: null,
      userAgent: null,
    });
    expect(parseUserAgent('')).toEqual({ device: null, userAgent: null });
    expect(parseUserAgent('not-a-real-user-agent')).toEqual({
      device: null,
      userAgent: 'not-a-real-user-agent',
    });
  });
});
