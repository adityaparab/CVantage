import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Express, NextFunction, Request, Response } from 'express';
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
  // CSP (issue #90 / 10.7): strict for the app; swagger UI (inline scripts)
  // keeps its own relaxed policy on /api/docs only.
  const csp = buildCsp(config.observability?.sentryDsn);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/docs')) {
      return helmet({ contentSecurityPolicy: false })(req, res, next);
    }
    return csp(req, res, next);
  });
  app.use(
    compression({
      filter: (req, res) => (req.path.endsWith('/events') ? false : compression.filter(req, res)),
    }),
  );
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

/** Strict CSP - script-src 'self' with zero inline scripts (#90). */
function buildCsp(sentryDsn?: string): ReturnType<typeof helmet> {
  const connect = ["'self'"];
  if (sentryDsn) {
    try {
      connect.push(new URL(sentryDsn).origin);
    } catch {
      /* invalid DSN is caught by env validation anyway */
    }
  }
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        // React style props (progress widths, gradients) need attr-level only
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: connect,
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
  });
}
