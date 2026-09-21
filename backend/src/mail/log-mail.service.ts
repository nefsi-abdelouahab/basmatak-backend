import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger/app.logger';
import { MailContext, MailService } from './mail.interface';
import { MailTemplates } from './mail-templates';

/**
 * Fallback provider when MAIL_HOST is unset: renders the same plain-text
 * body the SMTP provider would send and writes it to the app logger, keeping
 * local/dev parity without an SMTP server.
 */
@Injectable()
export class LogMailService implements MailService {
  constructor(
    private readonly templates: MailTemplates,
    private readonly logger: AppLogger,
  ) {}

  async sendVerificationEmail(to: string, context: MailContext): Promise<void> {
    const url = this.templates.verificationUrl(context.token);
    this.logger.log(
      `[mail] ${this.templates.verificationSubject()} -> ${to}\n${this.templates.verificationText(url)}`,
    );
  }

  async sendPasswordReset(to: string, context: MailContext): Promise<void> {
    const url = this.templates.passwordResetUrl(context.token);
    this.logger.log(
      `[mail] ${this.templates.passwordResetSubject()} -> ${to}\n${this.templates.passwordResetText(url)}`,
    );
  }
}
