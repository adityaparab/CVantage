import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config';
import { setupSwagger } from './docs/swagger.setup';
import { initServerSentry } from './observability/sentry';
import { mountSpa } from './spa/spa.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false, // applied with explicit limits in configureApp
  });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  await initServerSentry({
    dsn: config.observability.sentryDsn,
    environment: config.core.nodeEnv,
  });

  configureApp(app);
  setupSwagger(app);
  if (mountSpa(app)) {
    app.get(Logger).log('serving frontend/dist (SPA fallback active)', 'Bootstrap');
  }

  const { port } = app.get(AppConfigService).core;
  await app.listen(port, '0.0.0.0');

  app.get(Logger).log(`CVantage API listening on port ${port} (prefix /api/v1)`, 'Bootstrap');
}

void bootstrap();
