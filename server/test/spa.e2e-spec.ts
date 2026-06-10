import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { configureApp } from '../src/app.setup';
import { DocsProbeModule } from '../src/docs/docs-probe.module';
import { mountSpa } from '../src/spa/spa.middleware';

/**
 * SPA serving contract (issue #84 / 10.1). Uses the DB-free probe module +
 * a synthetic dist so it runs everywhere (no mongo, no real build needed).
 */
describe('SPA serving (issue #84 / 10.1)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const dist = mkdtempSync(join(tmpdir(), 'cvantage-dist-'));
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body>CVANTAGE_SHELL</body></html>');
    writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log("app")');

    const moduleRef = await Test.createTestingModule({ imports: [DocsProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    expect(mountSpa(app, dist)).toBe(true); // BEFORE init - ahead of nest 404
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer() as App);

  it('deep links serve the app shell with no-cache', async () => {
    for (const path of ['/resumes/abc', '/dashboard', '/admin/users/665f1c2ab79e8e3d4c8a9f01']) {
      const res = await http().get(path).expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('CVANTAGE_SHELL');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('hashed assets are immutable-cached; missing assets are real 404s', async () => {
    const ok = await http().get('/assets/index-abc123.js').expect(200);
    expect(ok.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const missing = await http().get('/assets/nope.js').expect(404);
    expect(missing.text).not.toContain('CVANTAGE_SHELL'); // never the shell
  });

  it('unknown /api/** stays a JSON 404 envelope', async () => {
    const res = await http().get('/api/v1/totally-nope').expect(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('the root serves the shell too', async () => {
    const res = await http().get('/').expect(200);
    expect(res.text).toContain('CVANTAGE_SHELL');
  });
});
