import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../auth/decorators';
import { AppConfigService } from '../config';

const READY_OK_EXAMPLE = {
  status: 'ok',
  info: { mongodb: { status: 'up' }, disk: { status: 'up' }, memory_heap: { status: 'up' } },
  error: {},
  details: { mongodb: { status: 'up' }, disk: { status: 'up' }, memory_heap: { status: 'up' } },
};

const READY_DOWN_EXAMPLE = {
  status: 'error',
  info: { disk: { status: 'up' }, memory_heap: { status: 'up' } },
  error: { mongodb: { status: 'down', message: 'connection is not ready' } },
  details: {
    mongodb: { status: 'down', message: 'connection is not ready' },
    disk: { status: 'up' },
    memory_heap: { status: 'up' },
  },
};

/**
 * Health endpoints (issue #15 / 1.6) — wired to Docker HEALTHCHECK (#93)
 * and Railway healthcheckPath (#96).
 * Public by design; throttling-exempt; excluded from auth in #22.
 * Terminus responses contain component status only — no URIs or internals.
 */
@ApiTags('health')
@Public()
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
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Confirms the process is up and serving HTTP. Touches no dependencies — ' +
      'stays green even when MongoDB is down. Use /health/ready for routing decisions.',
  })
  @ApiOkResponse({
    description: 'Process is alive',
    example: { status: 'ok', info: {}, error: {}, details: {} },
  })
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Verifies the instance can serve real traffic: MongoDB ping (3s timeout), ' +
      'disk usage below HEALTH_DISK_PERCENT and heap below HEALTH_MEM_HEAP_MB. ' +
      'Returns 503 with per-component status when any check fails.',
  })
  @ApiOkResponse({ description: 'All dependencies healthy', example: READY_OK_EXAMPLE })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies failing — instance must not receive traffic',
    example: READY_DOWN_EXAMPLE,
  })
  ready(): Promise<HealthCheckResult> {
    const { healthMemHeapMb, healthDiskPercent } = this.config.core;
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb', { timeout: 3000 }),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: healthDiskPercent }),
      () => this.memory.checkHeap('memory_heap', healthMemHeapMb * 1024 * 1024),
    ]);
  }
}
