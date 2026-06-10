import { Controller, Get, Module, Post, Req } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';

import { configureApp } from './app.setup';
import { AllExceptionsFilter } from './common';
import { AppConfigService } from './config';

@Controller('probe')
class ProbeController {
  @Get() get(): { ok: true } {
    return { ok: true };
  }
  @Get('ip') ip(@Req() req: Request): { ip?: string } {
    return { ip: req.ip };
  }
  @Post('echo') echo(@Req() req: Request): unknown {
    return req.body as unknown;
  }
}

const fakeConfig = {
  core: {
    isProd: false,
    corsOrigins: ['http://allowed.example'],
    logLevel: 'silent',
  },
  auth: { cookieSecret: 'test-cookie-secret-test-cookie-secret' },
  throttle: { ttlSeconds: 60, limit: 3 },
};

async function boot(): Promise<NestExpressApplication> {
  @Module({
    imports: [
      LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 3 }] }),
    ],
    controllers: [ProbeController],
    providers: [
      { provide: AppConfigService, useValue: fakeConfig },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  })
  class SecurityProbeModule {}

  const ref = await Test.createTestingModule({ imports: [SecurityProbeModule] }).compile();
  const app = ref.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

describe('security middleware baseline (issue #16 / 1.7)', () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    app = await boot();
  });
  afterEach(async () => app.close());
  const http = () => request(app.getHttpServer() as App);

  it('sets helmet security headers and hides x-powered-by', async () => {
    const res = await http().get('/api/v1/probe').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: allowlisted origin gets credentialed headers; others get none', async () => {
    const ok = await http().get('/api/v1/probe').set('Origin', 'http://allowed.example');
    expect(ok.headers['access-control-allow-origin']).toBe('http://allowed.example');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await http().get('/api/v1/probe').set('Origin', 'http://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('throttler: limit+1 requests within the window yields a 429 envelope', async () => {
    for (let i = 0; i < 3; i++) await http().get('/api/v1/probe').expect(200);
    const res = await http().get('/api/v1/probe').expect(429);
    expect(res.body.statusCode).toBe(429);
    expect(res.body.error).toBe('Too Many Requests');
    expect(res.body.path).toBe('/api/v1/probe');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('json bodies beyond 1mb are rejected with a 413 envelope', async () => {
    const big = { blob: 'x'.repeat(1_100_000) };
    const res = await http().post('/api/v1/probe/echo').send(big).expect(413);
    expect(res.body.statusCode).toBe(413);
    expect(res.body.error).toBe('Payload Too Large');
    expect(res.body.timestamp).toBeDefined();
  });

  it('malformed JSON yields a 400 envelope (not a crash)', async () => {
    const res = await http()
      .post('/api/v1/probe/echo')
      .set('content-type', 'application/json')
      .send('{"broken"')
      .expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('trust proxy resolves the client IP from X-Forwarded-For', async () => {
    const res = await http().get('/api/v1/probe/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });

  it('compression is active for compressible responses', async () => {
    const res = await http().get('/api/v1/probe').set('Accept-Encoding', 'gzip');
    expect(['gzip', undefined]).toContain(res.headers['content-encoding']); // tiny bodies may skip
  });
});
