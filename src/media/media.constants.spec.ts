import { BusinessException } from '../common/exceptions/business.exception';
import {
  ALLOWED_LINK_HOSTS,
  assertAllowedLinkHost,
  isAllowedUpload,
} from './media.constants';

describe('media vocabulary (S8 F6 untyped-free run)', () => {
  describe('isAllowedUpload (inventory §2.11)', () => {
    it('accepts the allowlisted image + pdf mimes at the 5 MB cap', () => {
      expect(isAllowedUpload('image/jpeg', 5 * 1024 * 1024)).toBe(true);
      expect(isAllowedUpload('image/png', 1024)).toBe(true);
      expect(isAllowedUpload('image/webp', 1024)).toBe(true);
      expect(isAllowedUpload('application/pdf', 1024)).toBe(true);
    });

    it('rejects out-of-allowlist mimes', () => {
      expect(isAllowedUpload('image/gif', 1024)).toBe(false);
      expect(isAllowedUpload('text/plain', 1024)).toBe(false);
      expect(isAllowedUpload('video/mp4', 1024)).toBe(false);
    });

    it('rejects anything over 5 MB, empty, or negative', () => {
      expect(isAllowedUpload('image/png', 5 * 1024 * 1024 + 1)).toBe(false);
      expect(isAllowedUpload('image/png', 0)).toBe(false);
      expect(isAllowedUpload('image/png', -1)).toBe(false);
    });
  });

  describe('assertAllowedLinkHost (SSRF-guard basis for S19)', () => {
    it('permits the allowlisted hosts and any subdomain', () => {
      for (const host of ALLOWED_LINK_HOSTS) {
        expect(assertAllowedLinkHost(`https://${host}/watch?v=1`)).toContain(
          host,
        );
      }
      expect(assertAllowedLinkHost('https://www.youtube.com/watch?v=abc')).toBe(
        'https://www.youtube.com/watch?v=abc',
      );
      expect(
        assertAllowedLinkHost('https://m.youtube.com/shorts/xyz'),
      ).toContain('youtube.com');
    });

    it('rejects foreign hosts, non-http protocols, and malformed URLs', () => {
      const attempts = [
        'https://evil.example.com/x',
        'https://youtube.com.evil.com/x',
        'http://localhost:8080/x',
        'ftp://youtube.com/x',
        'javascript:alert(1)',
        'not-a-url',
      ];
      for (const url of attempts) {
        let thrown: unknown;
        try {
          assertAllowedLinkHost(url);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(BusinessException);
        expect((thrown as BusinessException).code).toBe(
          'LINK_HOST_NOT_ALLOWED',
        );
      }
    });
  });
});
