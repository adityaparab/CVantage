import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppConfigService } from '../config';

import { ShutdownService } from './shutdown.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Controller('slow')
class SlowController {
  @Get()
  async slow(): Promise<{ done: boolean }> {
    await sleep(300);
    return { done: true };
  }
}

async function boot(timeoutMs = 25_000) {
  @Module({
    imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
    controllers: [SlowController],
    providers: [
      ShutdownService,
      { provide: AppConfigService, useValue: { core: { shutdownTimeoutMs: timeoutMs } } },
    ],
  })
  class ProbeModule {}
  const ref = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const app = ref.createNestApplication({ logger: false });
  app.enableShutdownHooks();
  await app.init();
  return app;
}

describe('graceful shutdown (issue #17 / 1.8)', () => {
  it('runs drain hooks in order before shutdown completes', async () => {
    const app = await boot();
    const service = app.get(ShutdownService);
    const order: string[] = [];
    service.registerDrainHook(async () => {
      await sleep(50);
      order.push('first');
    });
    service.registerDrainHook(async () => {
      order.push('second');
    });
    await app.close();
    expect(order).toEqual(['first', 'second']);
  });

  it('in-flight requests complete during close', async () => {
    const app = await boot();
    await app.listen(0); // real listening socket so the request is truly in flight
    // .then() forces supertest to dispatch immediately (it is lazy otherwise)
    const pending = request(app.getHttpServer() as App)
      .get('/slow')
      .then((r) => r);
    await sleep(100); // handler is now mid-flight (300ms total)
    const [res] = await Promise.all([pending, app.close()]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ done: true });
  });

  it('watchdog forces exit(1) when a hook hangs past the bound', async () => {
    jest.useFakeTimers();
    const app = await boot(5_000);
    const service = app.get(ShutdownService);
    const exitSpy = jest.spyOn(service, 'exit').mockImplementation(() => undefined);
    service.registerDrainHook(() => new Promise(() => undefined)); // never resolves

    const closing = app.close();
    await jest.advanceTimersByTimeAsync(5_001);
    expect(exitSpy).toHaveBeenCalledWith(1);

    jest.useRealTimers();
    void closing; // hung by design — process would have exited
  });

  it('watchdog is cleared on a clean shutdown (no exit call)', async () => {
    const app = await boot(1_000);
    const service = app.get(ShutdownService);
    const exitSpy = jest.spyOn(service, 'exit').mockImplementation(() => undefined);
    await app.close();
    await sleep(1_100);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
