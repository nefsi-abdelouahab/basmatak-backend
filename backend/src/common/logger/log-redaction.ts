const DEFAULT_MAX_CHARS = 1000;

/**
 * Sanitize a value before it is written to an operational log line.
 *
 * Provider/SDK errors can echo request fragments, connection strings, or
 * credentials. This helper removes the common secret shapes and caps the
 * output so a diagnostic log stays useful without becoming a leak.
 */
export function redactLogText(
  value: unknown,
  maxChars: number = DEFAULT_MAX_CHARS,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text === '') return undefined;

  const redacted = text
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s]+/gi, '$1[redacted]')
    .replace(/\bgsk_[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
    .replace(
      /([?&](?:api[_-]?key|key|token|secret|password)=)[^&\s]+/gi,
      '$1[redacted]',
    );

  if (redacted.length <= maxChars) return redacted;
  return `${redacted.slice(0, maxChars)}…`;
}
