import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigService } from '../config';

/**
 * Structured logging (issue #13 / 1.4).
 * - one completion line per request: method, path, status, duration, requestId
 * - request-id generated (uuid) or propagated from x-request-id
 * - secrets redacted at the logger level — they never reach transports
 * - pretty output in dev, pure JSON elsewhere; level from config
 * - nestjs-pino binds the logger to the request context (ALS) so feature
 *   code logging inside a request automatically carries requestId
 */

/** Redaction paths — extend cautiously; tested in logging.spec.ts. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.apiKey',
  '*.apiKeyEncrypted',
  '*.secret',
  '*.clientSecret',
];

type RequestWithContext = IncomingMessage & {
  id?: string | number;
  user?: { id?: string };
};

export function buildPinoHttpOptions(config: AppConfigService): Record<string, unknown> {
  const { isDev, logLevel } = { isDev: config.core.isDev, logLevel: config.core.logLevel };
  return {
    level: logLevel,
    genReqId: (req: IncomingMessage): string =>
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    customProps: (req: RequestWithContext): Record<string, unknown> => ({
      requestId: req.id,
      ...(req.user?.id ? { userId: req.user.id } : {}),
    }),
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse): string =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req: IncomingMessage, res: ServerResponse): string =>
      `${req.method} ${req.url} ${res.statusCode}`,
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
          },
        }
      : {}),
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: buildPinoHttpOptions(config),
      }),
    }),
  ],
})
export class LoggingModule {}
