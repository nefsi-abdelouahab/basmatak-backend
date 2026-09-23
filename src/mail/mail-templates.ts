import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MailLocale = 'ar' | 'fr';

const RTL_HTML_SKELETON = (body: string): string => `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;direction:rtl;text-align:right;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#1f2937;line-height:1.7;padding:32px 40px;">
          <tr><td style="padding:0 0 8px 0;font-size:14px;color:#6b7280;">بصمتك تطوع</td></tr>
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const linkHtml = (label: string, url: string): string =>
  `<p style="margin:20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;">${label}</a></p>`;

/**
 * Locale-swappable email templates. Default locale is Arabic (RTL-safe HTML +
 * plain-text fallback); French is retained as an alternate locale.
 */
@Injectable()
export class MailTemplates {
  private locale: MailLocale = 'ar';

  constructor(private readonly config: ConfigService) {}

  setLocale(locale: MailLocale): void {
    this.locale = locale;
  }

  getLocale(): MailLocale {
    return this.locale;
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000'
    );
  }

  verificationUrl(token: string): string {
    return `${this.baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  }

  passwordResetUrl(token: string): string {
    return `${this.baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  }

  verificationSubject(locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? 'تأكيد عنوان بريدك الإلكتروني'
      : 'Confirmez votre adresse e-mail';
  }

  passwordResetSubject(locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? 'إعادة تعيين كلمة المرور'
      : 'Réinitialisation de votre mot de passe';
  }

  verificationHtml(url: string, locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? this.verificationHtmlAr(url)
      : this.verificationHtmlFr(url);
  }

  passwordResetHtml(url: string, locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? this.passwordResetHtmlAr(url)
      : this.passwordResetHtmlFr(url);
  }

  verificationText(url: string, locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? this.verificationTextAr(url)
      : this.verificationTextFr(url);
  }

  passwordResetText(url: string, locale: MailLocale = this.locale): string {
    return locale === 'ar'
      ? this.passwordResetTextAr(url)
      : this.passwordResetTextFr(url);
  }

  private verificationTextAr(url: string): string {
    return [
      'مرحبًا،',
      '',
      'شكرًا لتسجيلك في بصمتك تطوع.',
      'لتأكيد عنوان بريدك الإلكتروني، يرجى النقر على الرابط التالي:',
      '',
      url,
      '',
      'يصلح هذا الرابط لمدة 24 ساعة.',
      '',
      'إذا لم تطلب هذا الإشعار، يمكنك تجاهل هذه الرسالة.',
    ].join('\n');
  }

  private verificationTextFr(url: string): string {
    return [
      'Bonjour,',
      '',
      'Merci de créer votre compte sur Basmatak Tatatoua (بصمتك تطوع).',
      'Pour valider votre adresse e-mail, cliquez sur le lien suivant :',
      '',
      url,
      '',
      'Ce lien expire dans 24 heures.',
      '',
      'Si vous n\u2019avez pas demandé ce message, vous pouvez l\u2019ignorer.',
    ].join('\n');
  }

  private passwordResetTextAr(url: string): string {
    return [
      'مرحبًا،',
      '',
      'لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.',
      'لاختيار كلمة مرور جديدة، يرجى النقر على الرابط التالي:',
      '',
      url,
      '',
      'يصلح هذا الرابط لمدة ساعة واحدة.',
      '',
      'إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة.',
    ].join('\n');
  }

  private passwordResetTextFr(url: string): string {
    return [
      'Bonjour,',
      '',
      'Vous avez demandé la réinitialisation de votre mot de passe.',
      'Cliquez sur le lien suivant pour choisir un nouveau mot de passe :',
      '',
      url,
      '',
      'Ce lien expire dans 1 heure.',
      '',
      'Si vous n\u2019avez pas demandé cette réinitialisation, ignorez ce message.',
    ].join('\n');
  }

  private verificationHtmlAr(url: string): string {
    return RTL_HTML_SKELETON(
      `<p style="margin:8px 0;">مرحبًا،</p>` +
        `<p style="margin:8px 0;">شكرًا لتسجيلك في بصمتك تطوع. لتأكيد عنوان بريدك الإلكتروني، يرجى النقر على الرابط التالي:</p>` +
        linkHtml('تأكيد البريد الإلكتروني', url) +
        `<p style="margin:8px 0;color:#6b7280;">يصلح هذا الرابط لمدة 24 ساعة.</p>` +
        `<p style="margin:8px 0;color:#6b7280;">إذا لم تطلب هذا الإشعار، يمكنك تجاهل هذه الرسالة.</p>`,
    );
  }

  private verificationHtmlFr(url: string): string {
    return `<div dir="ltr" lang="fr" style="direction:ltr;text-align:left;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#1f2937;line-height:1.7;padding:24px;">
  <p>Bonjour,</p>
  <p>Merci de créer votre compte sur Basmatak Tatatoua (بصمتك تطوع).</p>
  <p>Pour valider votre adresse e-mail, cliquez sur le lien suivant :</p>
  <p><a href="${escapeHtml(url)}" style="background-color:#0f766e;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;">Confirmer mon adresse e-mail</a></p>
  <p>Ce lien expire dans 24 heures.</p>
  <p>Si vous n'avez pas demandé ce message, vous pouvez l'ignorer.</p>
</div>`;
  }

  private passwordResetHtmlAr(url: string): string {
    return RTL_HTML_SKELETON(
      `<p style="margin:8px 0;">مرحبًا،</p>` +
        `<p style="margin:8px 0;">لقد طلبت إعادة تعيين كلمة المرور الخاصة بك. لاختيار كلمة مرور جديدة، يرجى النقر على الرابط التالي:</p>` +
        linkHtml('إعادة تعيين كلمة المرور', url) +
        `<p style="margin:8px 0;color:#6b7280;">يصلح هذا الرابط لمدة ساعة واحدة.</p>` +
        `<p style="margin:8px 0;color:#6b7280;">إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة.</p>`,
    );
  }

  private passwordResetHtmlFr(url: string): string {
    return `<div dir="ltr" lang="fr" style="direction:ltr;text-align:left;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#1f2937;line-height:1.7;padding:24px;">
  <p>Bonjour,</p>
  <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
  <p>Cliquez sur le lien suivant pour choisir un nouveau mot de passe :</p>
  <p><a href="${escapeHtml(url)}" style="background-color:#0f766e;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;">Réinitialiser mon mot de passe</a></p>
  <p>Ce lien expire dans 1 heure.</p>
  <p>Si vous n'avez pas demandé cette réinitialisation, ignorez ce message.</p>
</div>`;
  }
}
