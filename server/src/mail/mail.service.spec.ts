import { PinoLogger } from 'nestjs-pino';

import { ConsoleMailDriver } from './console.driver';
import { MailService } from './mail.service';
import { SmtpMailDriver } from './smtp.driver';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
}));

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;
const config = { core: { appBaseUrl: 'https://app.test' }, mail: {} } as never;

describe('Mail (issue #26 / 2.5)', () => {
  it('console driver records and logs rendered mails (dev/test inbox)', async () => {
    const driver = new ConsoleMailDriver(logger);
    const mail = new MailService(driver, config, logger);
    await mail.sendEmailVerification('ada@x.test', 'TOK123456789012345678901');
    expect(driver.sent).toHaveLength(1);
    expect(driver.sent[0]!.to).toBe('ada@x.test');
    expect(driver.sent[0]!.text).toContain('https://app.test/auth/verify-email?token=TOK');
  });

  it('reset template carries the 1h reset link', async () => {
    const driver = new ConsoleMailDriver(logger);
    const mail = new MailService(driver, config, logger);
    await mail.sendPasswordReset('ada@x.test', 'RTOK12345678901234567890');
    expect(driver.sent[0]!.subject).toMatch(/reset/i);
    expect(driver.sent[0]!.html).toContain('/auth/reset-password?token=RTOK');
  });

  it('smtp driver hands the message to nodemailer with the configured from', async () => {
    const nodemailer = jest.requireMock('nodemailer') as {
      createTransport: jest.Mock;
    };
    const driver = new SmtpMailDriver({
      host: 'smtp.test',
      port: 587,
      user: 'u',
      pass: 'p',
      from: 'CVantage <no-reply@test>',
    });
    await driver.send({ to: 'a@b.co', subject: 's', text: 't', html: '<p>t</p>' });
    const transport = nodemailer.createTransport.mock.results[0]!.value as {
      sendMail: jest.Mock;
    };
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'CVantage <no-reply@test>', to: 'a@b.co' }),
    );
  });

  it('background() swallows and logs failures (registration never breaks on mail)', async () => {
    const driver = new ConsoleMailDriver(logger);
    const mail = new MailService(driver, config, logger);
    mail.background(Promise.reject(new Error('smtp down')), 'test');
    await new Promise((r) => setImmediate(r));
    expect((logger as never as { error: jest.Mock }).error).toHaveBeenCalled();
  });
});
