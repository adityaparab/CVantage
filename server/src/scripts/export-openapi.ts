import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongooseHealthIndicator } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';

import { configureApp } from '../app.setup';
import { AppConfigModule } from '../config';
import { buildOpenApiDocument } from '../docs/swagger.setup';
import { HealthModule } from '../health/health.module';

/**
 * Emits openapi.json without a database (issue #18 / 1.9; CI artifact).
 * Controller modules mirror AppModule's HTTP surface; DB-backed providers
 * are stubbed — document generation never touches Mongo.
 * Usage: node dist/scripts/export-openapi.js [outfile]
 */
@Module({
  imports: [AppConfigModule, LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }), HealthModule],
})
class OpenApiExportModule {}

async function main(): Promise<void> {
  const ref = await Test.createTestingModule({ imports: [OpenApiExportModule] })
    .overrideProvider(MongooseHealthIndicator)
    .useValue({ pingCheck: () => Promise.resolve({ mongodb: { status: 'up' } }) })
    .compile();
  const app = ref.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app);
  await app.init();

  const document = buildOpenApiDocument(app);
  const out = resolve(process.argv[2] ?? 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2));
  await app.close();

  console.log(`OpenAPI spec written: ${out} (${Object.keys(document.paths).length} paths)`);
}

void main();
