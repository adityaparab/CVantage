import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Test } from '@nestjs/testing';

import { AppConfigService } from '../config';

import { HealthController } from './health.controller';

/**
 * Unit tests with mocked indicators (issue #15 / 1.6). The connected
 * ready-flips-503-when-Mongo-stops scenario runs against
 * mongodb-memory-server in the #19 e2e harness.
 */
describe('HealthController', () => {
  const checks: Array<() => unknown> = [];
  const healthCheck = {
    check: jest.fn(async (fns: Array<() => unknown>) => {
      checks.splice(0, checks.length, ...fns);
      for (const fn of fns) await fn();
      return { status: 'ok', info: {}, error: {}, details: {} };
    }),
  };
  const mongoose = { pingCheck: jest.fn().mockResolvedValue({ mongodb: { status: 'up' } }) };
  const disk = { checkStorage: jest.fn().mockResolvedValue({ disk: { status: 'up' } }) };
  const memory = { checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }) };

  let controller: HealthController;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheck },
        { provide: MongooseHealthIndicator, useValue: mongoose },
        { provide: DiskHealthIndicator, useValue: disk },
        { provide: MemoryHealthIndicator, useValue: memory },
        {
          provide: AppConfigService,
          useValue: { core: { healthMemHeapMb: 256, healthDiskPercent: 0.85 } },
        },
      ],
    }).compile();
    controller = ref.get(HealthController);
  });

  it('live touches no dependencies', async () => {
    const res = await controller.live();
    expect(res.status).toBe('ok');
    expect(mongoose.pingCheck).not.toHaveBeenCalled();
  });

  it('ready pings mongo and checks disk + heap with configured thresholds', async () => {
    const res = await controller.ready();
    expect(res.status).toBe('ok');
    expect(mongoose.pingCheck).toHaveBeenCalledWith('mongodb', { timeout: 3000 });
    expect(disk.checkStorage).toHaveBeenCalledWith('disk', {
      path: '/',
      thresholdPercent: 0.85,
    });
    expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 256 * 1024 * 1024);
  });

  it('response shape exposes component statuses only (no internals)', async () => {
    const res = await controller.ready();
    expect(JSON.stringify(res)).not.toMatch(/mongodb:\/\/|password|secret/i);
  });
});
