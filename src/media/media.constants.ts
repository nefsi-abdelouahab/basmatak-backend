import { BusinessException } from '../common/exceptions/business.exception';

/**
 * Media purposes (inventory §2.11 vs §3 `media`, roadmap S8 F3). Each purpose
 * is the upload/link "intent type", independent of §6 `visibility`. Consumer
 * fields (S9/S11 attach rows): `opportunity_cover` ↔ `opportunities.coverMediaId`;
 * `organization_cover` ↔ `organizations.coverMediaId`;
 * `organization_document` ↔ `organizations.annualReportMediaId`.
 *
 * Purpose → default visibility (§6 matrix, S8 F3/F17):
 * - `submission_evidence` uploads default `private` (evidence is sensitive
 *   until approved; only the submission owner/org may read it) — see
 *   `defaultVisibilityForPurpose`.
 * - every other purpose defaults `public` (owner + signed-upload preserved).
 */
export const MEDIA_PURPOSES = [
  'avatar',
  'organization_logo',
  'verification_document',
  'submission_evidence',
  'portfolio_item',
  'opportunity_cover',
  'organization_cover',
  'organization_document',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_VISIBILITIES = ['public', 'private'] as const;
export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];

/**
 * §6 default visibility for a purpose (design d4/3.1, S8 F3/F17): evidence
 * uploads default `private` (see the matrix on `MEDIA_PURPOSES`); every other
 * purpose defaults `public`. Applied only when the caller omits `visibility`.
 */
export function defaultVisibilityForPurpose(
  purpose: MediaPurpose,
): MediaVisibility {
  return purpose === 'submission_evidence' ? 'private' : 'public';
}

export const MEDIA_TYPES = ['file', 'link'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Upload allowlist (inventory §2.11): images + pdf, each ≤ 5 MB. */
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIMES = ['application/pdf'];
export const ALLOWED_UPLOAD_MIMES = [
  ...IMAGE_MIMES,
  ...DOCUMENT_MIMES,
] as const;

export function isAllowedUpload(mimeType: string, size: number): boolean {
  return (
    (IMAGE_MIMES.includes(mimeType) || DOCUMENT_MIMES.includes(mimeType)) &&
    size > 0 &&
    size <= MAX_UPLOAD_SIZE_BYTES
  );
}

/**
 * External video links (inventory §2.11): videos are never uploaded, only
 * referenced. The host allowlist is the SSRF-guard basis for S19.
 */
export const ALLOWED_LINK_HOSTS = [
  'youtube.com',
  'youtu.be',
  'drive.google.com',
] as const;

/**
 * Rejects non-http(s) URLs and any host outside the allowlist. Hosts match
 * exactly or as a subdomain of an allowlist entry, EXCEPT `youtu.be`, which is
 * exact-match only (no subdomains — SSRF-guard tightening, S19).
 */
export function assertAllowedLinkHost(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BusinessException(
      'LINK_HOST_NOT_ALLOWED',
      'The link URL is invalid',
      400,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BusinessException(
      'LINK_HOST_NOT_ALLOWED',
      'Only http(s) links are accepted',
      400,
    );
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_LINK_HOSTS.some((allowedHost) => {
    if (allowedHost === 'youtu.be') {
      return host === allowedHost;
    }
    return host === allowedHost || host.endsWith(`.${allowedHost}`);
  });
  if (!allowed) {
    throw new BusinessException(
      'LINK_HOST_NOT_ALLOWED',
      'The link host is not allowed',
      400,
    );
  }
  return url;
}
