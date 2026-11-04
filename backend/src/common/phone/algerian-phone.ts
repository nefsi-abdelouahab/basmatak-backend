/**
 * Algerian phone support (Phase 2 profile completion).
 *
 * Accepted human formats:
 * - local: `0XXXXXXXXX` (10 digits, leading 0)
 * - international: `+213XXXXXXXXX`
 * - international dialling prefix: `00213XXXXXXXXX`
 *
 * Spaces, dashes, dots, and parentheses are ignored. A valid Algerian
 * national number is 9 digits starting 2–7 (landline or mobile). The canonical
 * storage form is always `+213XXXXXXXXX`.
 */
export const ALGERIAN_PHONE_PATTERN = /^\+213[2-7]\d{8}$/;

export function normalizeAlgerianPhone(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const compact = value.replace(/[\s\-.()]/g, '');
  if (compact === '') {
    return null;
  }
  let national: string;
  if (compact.startsWith('+213')) {
    national = compact.slice(4);
  } else if (compact.startsWith('00213')) {
    national = compact.slice(5);
  } else if (compact.startsWith('0')) {
    national = compact.slice(1);
  } else {
    national = compact;
  }
  if (!/^[2-7]\d{8}$/.test(national)) {
    return null;
  }
  return `+213${national}`;
}
