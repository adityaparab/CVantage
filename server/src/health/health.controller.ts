import { Controller, Get } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { AppConfigService } from '../config';

/**
 * Health endpoints (issue #15 / 1.6) — wired to Docker HEALTHCHECK (#93)
 * and Railway healthcheckPath (#96).
 * - live:  process is up (no dependencies touched)
 * - ready: Mongo ping + disk + heap within thresholds → 503 on any failure
 * Public by design; excluded from throttling in #16 and from auth in #22.
 * Terminus responses contain component status only — no URIs or internals.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: AppConfigService,
  ) {}

  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    const { healthMemHeapMb, healthDiskPercent } = this.config.core;
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb', { timeout: 3000 }),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: healthDiskPercent }),
      () => this.memory.checkHeap('memory_heap', healthMemHeapMb * 1024 * 1024),
    ]);
  }
}
