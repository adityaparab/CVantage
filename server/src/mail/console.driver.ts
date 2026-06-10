import { PinoLogger } from 'nestjs-pino';

import type { MailDriver, MailMessage } from './mail.types';

/**
 * Zero-setup local driver (issue #26 / 2.5): renders mails into the log and
 * keeps the most recent ones in memory so dev flows and e2e tests can grab
 * verification/reset links without an inbox.
 */
export class ConsoleMailDriver implements MailDriver {
  readonly name = 'console' as const;
  readonly sent: MailMessage[] = [];

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('Mail');
  }

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 50) this.sent.shift();
    this.logger.info(
      { to: message.to, subject: message.subject },
      `mail (console driver):\n${message.text}`,
    );
  }
}
