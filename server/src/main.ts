import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfigService } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // CLAUDE.md contract: every route lives under /api/v1 (prefix + URI versioning).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const { port } = app.get(AppConfigService).core;
  await app.listen(port, '0.0.0.0');

  app.get(Logger).log(`CVantage API listening on port ${port} (prefix /api/v1)`, 'Bootstrap');
}

void bootstrap();
