import { Global, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongooseHealthIndicator } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';

import { configureApp } from '../app.setup';
import { AppConfigService } from '../config';
import { HealthModule } from '../health/health.module';

import { setupSwagger } from './swagger.setup';

/**
 * Documentation-contract enforcement (issue #18 / 1.9).
 * Every route the HTTP server exposes (minus the docs endpoints themselves)
 * must appear in the OpenAPI document with summary, description and at least
 * one documented success response. New controllers join AppModule → they are
 * automatically held to the contract here.
 */
const fakeConfig = {
  core: {
    isProd: false,
    swaggerEnabled: true,
    corsOrigins: [],
    logLevel: 'silent',
  },
  auth: { cookieSecret: 'docs-spec-cookie-secret-docs-spec-cookie' },
};

// Global fake config so module-scoped controllers (HealthModule) resolve it,
// mirroring the real @Global AppConfigModule.
@Global()
@Module({
  providers: [{ provide: AppConfigService, useValue: fakeConfig }],
  exports: [AppConfigService],
})
class FakeConfigModule {}

// Controller modules mounted in AppModule (DB-backed providers stubbed).
@Module({
  imports: [
    FakeConfigModule,
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    HealthModule,
  ],
})
class DocsProbeModule {}

describe('OpenAPI documentation contract (issue #18 / 1.9)', () => {
  let app: NestExpressApplication;
  let document: Record<string, unknown>;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [DocsProbeModule] })
      .overrideProvider(MongooseHealthIndicator)
      .useValue({ pingCheck: jest.fn() })
      .compile();
    app = ref.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    configureApp(app);
    setupSwagger(app);
    await app.init();
    const res = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);
    expect(res.headers['content-type']).toContain('application/json');
    document = res.body as Record<string, unknown>;
  });

  afterAll(async () => app.close());

  it('serves a valid OpenAPI 3.x document at /api/docs-json', () => {
    expect(String(document.openapi)).toMatch(/^3\./);
    expect(document.paths).toBeDefined();
    expect(Object.keys(document.paths as object).length).toBeGreaterThan(0);
  });

  it('serves the UI and the yaml variant', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/docs')
      .expect(200);
    const yaml = await request(app.getHttpServer() as App)
      .get('/api/docs-yaml')
      .expect(200);
    expect(yaml.text).toContain('openapi:');
  });

  it('every exposed route is documented (no undocumented endpoints)', () => {
    type RouterStack = { stack: Array<{ route?: { path: string } }> };
    const expressApp = app.getHttpAdapter().getInstance() as unknown as {
      _router?: RouterStack;
      router?: RouterStack; // express 5
    };
    const stack = (expressApp.router ?? expressApp._router)?.stack ?? [];
    const served = stack
      .filter((l) => l.route?.path?.startsWith('/api/'))
      .map((l) => l.route!.path)
      .filter((p) => !p.startsWith('/api/docs'))
      .filter((p) => !p.includes('*')); // Nest's global-prefix catch-all 404 handler
    const documented = Object.keys(document.paths as object);
    for (const route of served) {
      expect(documented).toContain(route);
    }
    expect(served.length).toBeGreaterThanOrEqual(2); // live + ready today
  });

  it('every operation has a summary, a description and a success response with example', () => {
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;
    const failures: string[] = [];
    for (const [route, ops] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const label = `${method.toUpperCase()} ${route}`;
        if (!op.summary) failures.push(`${label}: missing summary`);
        if (!op.description) failures.push(`${label}: missing description`);
        const responses = (op.responses ?? {}) as Record<
          string,
          { example?: unknown; content?: unknown }
        >;
        const success = Object.keys(responses).find((code) => code.startsWith('2'));
        if (!success) {
          failures.push(`${label}: no 2xx response documented`);
          continue;
        }
        const ok = responses[success]!;
        const hasExample =
          ok.example !== undefined || JSON.stringify(ok.content ?? {}).includes('example');
        if (!hasExample) failures.push(`${label}: 2xx response lacks an example`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('shared ErrorEnvelope schema is registered for error references', () => {
    const components = document.components as { schemas?: Record<string, unknown> };
    expect(components.schemas?.ErrorEnvelopeDto).toBeDefined();
  });

  it('all docs routes 404 when SWAGGER_ENABLED is false', async () => {
    const ref = await Test.createTestingModule({
      imports: [DocsProbeModule],
    })
      .overrideProvider(MongooseHealthIndicator)
      .useValue({ pingCheck: jest.fn() })
      .overrideProvider(AppConfigService)
      .useValue({ ...fakeConfig, core: { ...fakeConfig.core, swaggerEnabled: false } })
      .compile();
    const offApp = ref.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    configureApp(offApp);
    setupSwagger(offApp);
    await offApp.init();
    await request(offApp.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(404);
    await request(offApp.getHttpServer() as App)
      .get('/api/docs')
      .expect(404);
    await offApp.close();
  });
});
