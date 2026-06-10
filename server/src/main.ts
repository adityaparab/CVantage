import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // CLAUDE.md contract: every route lives under /api/v1 (prefix + URI versioning).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Typed config arrives with #11 (1.2); PORT is read directly until then.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`CVantage API listening on port ${port} (prefix /api/v1)`, 'Bootstrap');
}

void bootstrap();
