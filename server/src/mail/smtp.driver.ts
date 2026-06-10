import { createTransport, type Transporter } from 'nodemailer';

import type { MailDriver, MailMessage } from './mail.types';

export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

/** Production driver (issue #26 / 2.5) — any SMTP relay via env. */
export class SmtpMailDriver implements MailDriver {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transporter = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.settings.from, ...message });
  }
}
