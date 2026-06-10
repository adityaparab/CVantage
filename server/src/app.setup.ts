import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';

import { AppConfigService } from './config';

/**
 * Application wiring shared by main.ts and the test harness (issue #16 / 1.7).
 * Everything here is environment-driven via AppConfigService.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfigService);
  const express = app.getHttpAdapter().getInstance() as Express;

  // CLAUDE.md contract: every route lives under /api/v1.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Behind Railway's proxy the first hop is trusted so req.ip / rate limits
  // see real client addresses.
  express.set('trust proxy', 1);
  express.disable('x-powered-by');

  // Security headers. CSP is intentionally off until #87 (10.7) ships a
  // strict policy compatible with the SPA + Swagger UI.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cookieParser(config.auth.cookieSecret));

  // Request body bounds (multipart uploads get their own limits in #35).
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  app.enableCors({
    origin: config.core.corsOrigins,
    credentials: true,
    maxAge: 86_400,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Graceful shutdown lifecycle (#17 / 1.8).
  app.enableShutdownHooks();

  return app;
}
