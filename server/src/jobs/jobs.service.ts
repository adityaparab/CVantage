import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config';
import { ShutdownService } from '../lifecycle/shutdown.service';

import { JobHandler, JobQueueConfig, JobRunnerOptions, MongoJobRunner } from './job-runner';

/**
 * Runner factory (issue #40 / 4.3): pipelines (#42/#43) create their queue
 * runner here; every runner is automatically wired into graceful shutdown.
 */
@Injectable()
export class JobsService {
  private readonly runners: MongoJobRunner<never>[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly shutdown: ShutdownService,
  ) {}

  createRunner<T extends { _id: unknown }>(
    cfg: JobQueueConfig<T>,
    handler: JobHandler<T>,
    overrides: Partial<JobRunnerOptions> = {},
  ): MongoJobRunner<T> {
    const runner = new MongoJobRunner(cfg, handler, {
      concurrency: this.config.jobs.concurrency,
      ...overrides,
    });
    this.runners.push(runner as unknown as MongoJobRunner<never>);
    this.shutdown.registerDrainHook(() => runner.drain());
    return runner;
  }
}
