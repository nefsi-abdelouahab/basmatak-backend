import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger/app.logger';
import { MAIL_SERVICE } from './mail.interface';
import { MailTemplates } from './mail-templates';
import { SmtpMailService } from './smtp-mail.service';
import { LogMailService } from './log-mail.service';

/**
 * Selects the mail provider from config: SmtpMailService when MAIL_HOST is
 * set, LogMailService otherwise. Tests override MAIL_SERVICE with a double.
 */
@Module({
  providers: [
    MailTemplates,
    {
      provide: MAIL_SERVICE,
      useFactory: (
        config: ConfigService,
        logger: AppLogger,
        templates: MailTemplates,
      ) => {
        const mail = config.get<string>('MAIL_HOST')
          ? new SmtpMailService(config, templates, logger)
          : new LogMailService(templates, logger);
        return mail;
      },
      inject: [ConfigService, AppLogger, MailTemplates],
    },
  ],
  exports: [MAIL_SERVICE, MailTemplates],
})
export class MailModule {}
