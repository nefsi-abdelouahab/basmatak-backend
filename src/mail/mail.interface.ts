import { Inject } from '@nestjs/common';

/** Token used to inject whichever mail provider is active (Smtp/Log/Test). */
export const MAIL_SERVICE = 'MAIL_SERVICE';

export const InjectMail = () => Inject(MAIL_SERVICE);

/** Raw unhashed token scope; the provider builds the clickable URL. */
export interface MailContext {
  token: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound mail seam (inventory §3 auth). Providers swap behind the token:
 * `SmtpMailService` when MAIL_HOST is set, `LogMailService` otherwise, and a
 * test double in e2e. Messages default to Arabic (RTL-safe HTML + plain-text
 * fallback, locale-swappable).
 */
export interface MailService {
  sendVerificationEmail(to: string, context: MailContext): Promise<void>;
  sendPasswordReset(to: string, context: MailContext): Promise<void>;
}
