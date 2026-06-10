import { Writable } from 'node:stream';

import { Controller, Get, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';

import { buildPinoHttpOptions, REDACT_PATHS } from './logging.module';

/** In-memory log sink. */
class MemorySink extends Writable {
  lines: Record<string, unknown>[] = [];
  override _write(chunk: Buffer, _enc: string, cb: () => void): void {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      this.lines.push(JSON.parse(line) as Record<string, unknown>);
    }
    cb();
  }
}

@Controller()
class ProbeController {
  @Get('ping')
  ping(): { ok: boolean } {
    return { ok: true };
  }
  @Post('login')
  login(): { ok: boolean } {
    return { ok: true };
  }
}

const fakeConfig = (logLevel = 'info') => ({ core: { isDev: false, logLevel } }) as never;

async function bootApp(sink: MemorySink, logLevel?: string) {
  @Module({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: [buildPinoHttpOptions(fakeConfig(logLevel)) as never, sink],
      }),
    ],
    controllers: [ProbeController],
  })
  class TestAppModule {}

  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}

describe('structured logging (issue #13 / 1.4)', () => {
  it('emits exactly one completion line per request with correlation fields', async () => {
    const sink = new MemorySink();
    const app = await bootApp(sink);
    await request(app.getHttpServer() as App)
      .get('/ping')
      .expect(200);
    await app.close();

    const completions = sink.lines.filter((l) => typeof l.responseTime === 'number');
    expect(completions).toHaveLength(1);
    const line = completions[0]!;
    expect(line.requestId).toBeDefined();
    expect((line.req as { method: string }).method).toBe('GET');
    expect((line.req as { url: string }).url).toBe('/ping');
    expect((line.res as { statusCode: number }).statusCode).toBe(200);
  });

  it('propagates x-request-id and keeps concurrent requests distinct', async () => {
    const sink = new MemorySink();
    const app = await bootApp(sink);
    await Promise.all([
      request(app.getHttpServer() as App)
        .get('/ping')
        .set('x-request-id', 'req-A'),
      request(app.getHttpServer() as App)
        .get('/ping')
        .set('x-request-id', 'req-B'),
    ]);
    await app.close();
    const ids = sink.lines
      .filter((l) => typeof l.responseTime === 'number')
      .map((l) => l.requestId)
      .sort();
    expect(ids).toEqual(['req-A', 'req-B']);
  });

  it('redacts authorization, cookies and password-bearing bodies', async () => {
    const sink = new MemorySink();
    const app = await bootApp(sink);
    await request(app.getHttpServer() as App)
      .post('/login')
      .set('authorization', 'Bearer super-secret-token')
      .set('cookie', 'session=top-secret')
      .send({ email: 'a@b.co', password: 'hunter2-hunter2' })
      .expect(201);
    await app.close();

    const raw = JSON.stringify(sink.lines);
    expect(raw).not.toContain('super-secret-token');
    expect(raw).not.toContain('top-secret');
    expect(raw).not.toContain('hunter2-hunter2');
  });

  it('honors LOG_LEVEL (warn silences request info lines)', async () => {
    const sink = new MemorySink();
    const app = await bootApp(sink, 'warn');
    await request(app.getHttpServer() as App)
      .get('/ping')
      .expect(200);
    await app.close();
    expect(sink.lines.filter((l) => typeof l.responseTime === 'number')).toHaveLength(0);
  });

  it('redaction list covers the credential families', () => {
    for (const needle of ['authorization', 'cookie', 'password', 'apiKey', 'token', 'secret']) {
      expect(REDACT_PATHS.join(' ')).toContain(needle);
    }
  });
});
