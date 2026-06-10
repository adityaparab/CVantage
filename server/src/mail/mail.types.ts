export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailDriver {
  readonly name: 'console' | 'smtp';
  send(message: MailMessage): Promise<void>;
}

export const MAIL_DRIVER = Symbol('MAIL_DRIVER');
