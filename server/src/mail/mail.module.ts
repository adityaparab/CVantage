import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config';

import { ConsoleMailDriver } from './console.driver';
import { MailService } from './mail.service';
import { MAIL_DRIVER, type MailDriver } from './mail.types';
import { SmtpMailDriver } from './smtp.driver';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_DRIVER,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger): MailDriver => {
        const { driver, smtp } = config.mail;
        if (driver === 'smtp') {
          return new SmtpMailDriver({
            host: smtp.host!,
            port: smtp.port!,
            user: smtp.user,
            pass: smtp.pass,
            from: smtp.from!,
          });
        }
        return new ConsoleMailDriver(logger);
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
