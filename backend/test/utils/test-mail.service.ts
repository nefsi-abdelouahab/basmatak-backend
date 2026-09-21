import { MailContext, MailService } from '../../src/mail/mail.interface';

export interface SentMailRecord {
  to: string;
  kind: 'verify' | 'reset';
  token: string;
}

/**
 * Test double injected via MAIL_SERVICE in e2e tests. Records every sent
 * message so flows (register → verify, forgot → reset) can be asserted.
 */
export class TestMailService implements MailService {
  readonly sent: SentMailRecord[] = [];

  private record(
    to: string,
    kind: SentMailRecord['kind'],
    token: string,
  ): void {
    this.sent.push({ to, kind, token });
  }

  async sendVerificationEmail(to: string, context: MailContext): Promise<void> {
    this.record(to, 'verify', context.token);
  }

  async sendPasswordReset(to: string, context: MailContext): Promise<void> {
    this.record(to, 'reset', context.token);
  }

  latest(kind: SentMailRecord['kind']): SentMailRecord | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i].kind === kind) {
        return this.sent[i];
      }
    }
    return undefined;
  }

  clear(): void {
    this.sent.length = 0;
  }
}
