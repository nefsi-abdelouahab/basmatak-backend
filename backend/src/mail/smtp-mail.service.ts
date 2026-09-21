import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppLogger } from '../common/logger/app.logger';
import { MailContext, MailMessage, MailService } from './mail.interface';
import { MailTemplates } from './mail-templates';

/**
 * Real SMTP provider (free tier: Brevo SMTP relay, inventory §10).
 * Safe when MAIL_* are unset: the transport is disabled and messages are
 * dropped with a warning instead of crashing.
 */
@Injectable()
export class SmtpMailService implements MailService {
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(
    config: ConfigService,
    private readonly templates: MailTemplates,
    private readonly logger: AppLogger,
  ) {
    const host = config.get<string>('MAIL_HOST');
    if (!host) {
      this.transporter = null;
      this.from = '';
      return;
    }
    const user = config.get<string>('MAIL_USER');
    this.from =
      config.get<string>('MAIL_FROM') ??
      'Basmatak Tatatoua <no-reply@basmatak.tn>';
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get<number>('MAIL_PORT', 587)) || 587,
      secure: String(config.get('MAIL_SECURE')).toLowerCase() === 'true',
      auth:
        user && config.get<string>('MAIL_PASS')
          ? { user, pass: config.get<string>('MAIL_PASS') }
          : undefined,
    });
  }

  async sendVerificationEmail(to: string, context: MailContext): Promise<void> {
    const url = this.templates.verificationUrl(context.token);
    await this.dispatch({
      to,
      subject: this.templates.verificationSubject(),
      text: this.templates.verificationText(url),
    });
  }

  async sendPasswordReset(to: string, context: MailContext): Promise<void> {
    const url = this.templates.passwordResetUrl(context.token);
    await this.dispatch({
      to,
      subject: this.templates.passwordResetSubject(),
      text: this.templates.passwordResetText(url),
    });
  }

  private async dispatch(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP mail disabled (MAIL_HOST unset); drop: ${message.subject} -> ${message.to}`,
      );
      return;
    }
    await this.transporter.sendMail({ ...message, from: this.from });
  }
}
