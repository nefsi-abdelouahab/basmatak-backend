import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Plain-text, French-default email templates (Arabic/French-safe: no HTML,
 * plain unicode text). Links are built from PUBLIC_BASE_URL.
 */
@Injectable()
export class MailTemplates {
  constructor(private readonly config: ConfigService) {}

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

  verificationSubject(): string {
    return 'Confirmez votre adresse e-mail';
  }

  verificationText(url: string): string {
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

  passwordResetSubject(): string {
    return 'Réinitialisation de votre mot de passe';
  }

  passwordResetText(url: string): string {
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
}
