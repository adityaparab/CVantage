import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config';

import { MAIL_DRIVER, type MailDriver } from './mail.types';

/**
 * Mail facade (issue #26 / 2.5). Templates live here; transport is a driver.
 * Sending is awaited by callers that need delivery semantics and
 * fire-and-forget elsewhere (registration must not fail on mail trouble).
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_DRIVER) readonly driver: MailDriver,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MailService.name);
  }

  private layout(title: string, bodyHtml: string): string {
    return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
<h2 style="color:#1c2b4a">CVantage</h2><h3>${title}</h3>${bodyHtml}
<p style="color:#667;font-size:12px">If you didn't request this, you can safely ignore this email.</p></div>`;
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const url = `${this.config.core.appBaseUrl}/auth/verify-email?token=${token}`;
    await this.driver.send({
      to,
      subject: 'Verify your CVantage email',
      text: `Welcome to CVantage!\n\nVerify your email (valid 24h):\n${url}\n`,
      html: this.layout(
        'Verify your email',
        `<p>Welcome to CVantage! This link is valid for 24 hours.</p>
         <p><a href="${url}">Verify my email</a></p><p>${url}</p>`,
      ),
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${this.config.core.appBaseUrl}/auth/reset-password?token=${token}`;
    await this.driver.send({
      to,
      subject: 'Reset your CVantage password',
      text: `A password reset was requested for your account.\n\nReset link (valid 1h):\n${url}\n`,
      html: this.layout(
        'Reset your password',
        `<p>A password reset was requested for your account. The link is valid for 1 hour.</p>
         <p><a href="${url}">Choose a new password</a></p><p>${url}</p>`,
      ),
    });
  }

  /** Fire-and-forget wrapper — logs failures, never throws into user flows. */
  background(promise: Promise<void>, context: string): void {
    void promise.catch((err) => this.logger.error({ err }, `mail send failed: ${context}`));
  }
}
