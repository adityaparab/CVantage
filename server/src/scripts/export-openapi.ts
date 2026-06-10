import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongooseHealthIndicator } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';

import { configureApp } from '../app.setup';
import { DocsProbeModule } from '../docs/docs-probe.module';
import { buildOpenApiDocument } from '../docs/swagger.setup';

/**
 * Emits openapi.json without a database (issue #18 / 1.9; CI artifact).
 * Uses the same DB-free controller assembly the docs contract test enforces.
 * Usage: node dist/scripts/export-openapi.js [outfile]
 */
async function main(): Promise<void> {
  const ref = await Test.createTestingModule({ imports: [DocsProbeModule] })
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
