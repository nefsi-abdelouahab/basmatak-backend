export interface SessionDevice {
  browser?: string;
  os?: string;
  device?: string;
}

export interface ParsedUserAgent {
  device: SessionDevice | null;
  userAgent: string | null;
}

const BROWSER_CHECKS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
  { name: 'Opera', pattern: /OPR\/([\d.]+)/ },
  { name: 'Samsung Internet', pattern: /SamsungBrowser\/([\d.]+)/ },
  { name: 'Firefox', pattern: /Firefox\/([\d.]+)/ },
  { name: 'Chrome', pattern: /Chrome\/([\d.]+)/ },
  { name: 'Safari', pattern: /Version\/([\d.]+).*\bSafari\// },
];

const OS_CHECKS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'iOS', pattern: /iPhone|iPad|iPod/ },
  { name: 'Android', pattern: /Android[ /]([\d.]+)/ },
  { name: 'Chrome OS', pattern: /CrOS|ChromiumOS/ },
  { name: 'Windows', pattern: /Windows NT ([\d.]+)/ },
  { name: 'macOS', pattern: /Macintosh;.*Mac OS X|Mac OS X/ },
  { name: 'Linux', pattern: /\bLinux\b/ },
];

/**
 * A deliberately small, self-contained User-Agent parser producing coarse
 * `{ browser, os, device }` buckets for the sessions/devices screens
 * (org-ops). It never throws and returns `device: null` for headers it
 * cannot classify; the raw header is stored alongside so nothing is lost.
 */
export function parseUserAgent(
  raw: string | null | undefined,
): ParsedUserAgent {
  const userAgent = raw?.trim() || null;
  if (!userAgent) {
    return { device: null, userAgent: null };
  }
  const device = classify(userAgent);
  return device ? { device, userAgent } : { device: null, userAgent };
}

function classify(userAgent: string): SessionDevice | null {
  const device: SessionDevice = {};

  const browser = matchFirst(BROWSER_CHECKS, userAgent);
  if (browser) {
    device.browser = browser;
  }

  const os = matchFirst(OS_CHECKS, userAgent);
  if (os) {
    device.os = os;
  }

  const physical = detectDevice(userAgent);
  if (physical) {
    device.device = physical;
  }

  return Object.keys(device).length > 0 ? device : null;
}

/** Returns the name of the first check that matches, if any. */
function matchFirst(
  checks: ReadonlyArray<{ name: string; pattern: RegExp }>,
  userAgent: string,
): string | undefined {
  for (const check of checks) {
    const match = userAgent.match(check.pattern);
    if (match) {
      return check.name;
    }
  }
  return undefined;
}

function detectDevice(userAgent: string): string | undefined {
  if (/iPhone/.test(userAgent)) {
    return 'iPhone';
  }
  if (/iPad/.test(userAgent)) {
    return 'iPad';
  }
  if (/iPod/.test(userAgent)) {
    return 'iPod';
  }
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? 'mobile' : 'tablet';
  }
  return undefined;
}
