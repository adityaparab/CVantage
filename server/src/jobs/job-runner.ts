import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';

type LooseModel = Model<Record<string, unknown>>;

export type JobHandler<T> = (job: T) => Promise<void>;

export interface JobQueueConfig<T> {
  name: string;
  model: Model<T>;
  /** Dotted paths so nested queues (resume.uploadParse) work too. */
  statusPath: string;
  pendingValue: string;
  processingValue: string;
  failedValue: string;
  ownerPath: string;
  heartbeatPath: string;
  retryPath: string;
  errorPath: string;
  sortField: string;
}

export interface JobRunnerOptions {
  concurrency: number;
  pollMs?: number;
  heartbeatMs?: number;
  staleMs?: number;
  recoveryMs?: number;
  maxRetries?: number;
}

export interface JobRunnerHandle {
  stop(): Promise<void>;
}

const DEFAULTS = {
  pollMs: 750,
  heartbeatMs: 10_000,
  staleMs: 45_000,
  recoveryMs: 60_000,
  maxRetries: 5,
};

/**
 * Mongo-backed job runner (issue #40 / 4.3, decision D7).
 * Claim is a single findOneAndUpdate (atomic across instances); liveness via
 * heartbeats; crash recovery re-queues stale claims with a retry budget;
 * drain stops claiming and waits for in-flight work (registered with the
 * ShutdownService so SIGTERM is graceful). Interface kept narrow so a BullMQ
 * implementation can swap in later.
 */
export class MongoJobRunner<T extends { _id: unknown }> {
  private readonly logger: Logger;
  private readonly opts: Required<JobRunnerOptions>;
  private readonly workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly inFlight = new Map<string, Promise<void>>();
  private pollTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;
  private accepting = true;

  constructor(
    private readonly cfg: JobQueueConfig<T>,
    private readonly handler: JobHandler<T>,
    options: JobRunnerOptions,
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.logger = new Logger(`JobRunner:${cfg.name}`);
  }

  /** Dynamic dotted paths defeat mongoose's generic update typing. */
  private get m(): LooseModel {
    return this.cfg.model as unknown as LooseModel;
  }

  get id(): string {
    return this.workerId;
  }

  get active(): number {
    return this.inFlight.size;
  }

  /** Settle every in-flight job (tests + drain). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  start(): void {
    void this.recover('boot');
    this.pollTimer = setInterval(() => void this.tick(), this.opts.pollMs);
    this.pollTimer.unref();
    this.heartbeatTimer = setInterval(() => void this.beat(), this.opts.heartbeatMs);
    this.heartbeatTimer.unref();
    this.recoveryTimer = setInterval(() => void this.recover('scan'), this.opts.recoveryMs);
    this.recoveryTimer.unref();
    this.logger.log(`started worker=${this.workerId} concurrency=${this.opts.concurrency}`);
  }

  /** Claim-and-run until the concurrency budget is spent. */
  async tick(): Promise<void> {
    while (this.accepting && this.inFlight.size < this.opts.concurrency) {
      const job = await this.claim();
      if (!job) return;
      const key = String(job._id);
      const run = this.run(job).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, run);
    }
  }

  /** Atomic pending -> processing transition; oldest first. */
  private claim(): Promise<T | null> {
    return this.m
      .findOneAndUpdate(
        { [this.cfg.statusPath]: this.cfg.pendingValue },
        {
          $set: {
            [this.cfg.statusPath]: this.cfg.processingValue,
            [this.cfg.ownerPath]: this.workerId,
            [this.cfg.heartbeatPath]: new Date(),
          },
        },
        { sort: { [this.cfg.sortField]: 1 }, new: true },
      )
      .exec() as unknown as Promise<T | null>;
  }

  private async run(job: T): Promise<void> {
    try {
      await this.handler(job);
      // Pipelines normally set their own terminal status; this is the safety
      // net so a job can never wedge in "processing" after a clean handler.
      await this.m
        .updateOne(
          {
            _id: job._id,
            [this.cfg.statusPath]: this.cfg.processingValue,
            [this.cfg.ownerPath]: this.workerId,
          },
          { $unset: { [this.cfg.ownerPath]: 1, [this.cfg.heartbeatPath]: 1 } },
        )
        .exec();
    } catch (err) {
      await this.handleFailure(job, err);
    }
  }

  private async handleFailure(job: T, err: unknown): Promise<void> {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1900);
    const retryable = (err as { retryable?: boolean }).retryable !== false;
    const retries =
      ((job as Record<string, unknown>)[this.cfg.retryPath] as number | undefined) ?? 0;
    if (retryable && retries < this.opts.maxRetries) {
      this.logger.warn(`job ${String(job._id)} failed (retry ${retries + 1}): ${message}`);
      await this.m
        .updateOne(
          { _id: job._id, [this.cfg.statusPath]: this.cfg.processingValue },
          {
            $set: { [this.cfg.statusPath]: this.cfg.pendingValue },
            $inc: { [this.cfg.retryPath]: 1 },
            $unset: { [this.cfg.ownerPath]: 1, [this.cfg.heartbeatPath]: 1 },
          },
        )
        .exec();
      return;
    }
    this.logger.error(`job ${String(job._id)} failed terminally: ${message}`);
    await this.m
      .updateOne(
        { _id: job._id, [this.cfg.statusPath]: this.cfg.processingValue },
        {
          $set: { [this.cfg.statusPath]: this.cfg.failedValue, [this.cfg.errorPath]: message },
          $unset: { [this.cfg.ownerPath]: 1, [this.cfg.heartbeatPath]: 1 },
        },
      )
      .exec();
  }

  /** Liveness for everything this worker is processing. */
  private async beat(): Promise<void> {
    if (this.inFlight.size === 0) return;
    await this.m
      .updateMany(
        {
          [this.cfg.statusPath]: this.cfg.processingValue,
          [this.cfg.ownerPath]: this.workerId,
        },
        { $set: { [this.cfg.heartbeatPath]: new Date() } },
      )
      .exec();
  }

  /** Re-queue stale claims (crashed/partitioned worker); exhaust to failed. */
  async recover(reason: string): Promise<void> {
    const staleBefore = new Date(Date.now() - this.opts.staleMs);
    const stale = {
      [this.cfg.statusPath]: this.cfg.processingValue,
      [this.cfg.heartbeatPath]: { $lt: staleBefore },
    };
    const requeued = await this.m
      .updateMany(
        { ...stale, [this.cfg.retryPath]: { $lt: this.opts.maxRetries } },
        {
          $set: { [this.cfg.statusPath]: this.cfg.pendingValue },
          $inc: { [this.cfg.retryPath]: 1 },
          $unset: { [this.cfg.ownerPath]: 1, [this.cfg.heartbeatPath]: 1 },
        },
      )
      .exec();
    const exhausted = await this.m
      .updateMany(
        { ...stale, [this.cfg.retryPath]: { $gte: this.opts.maxRetries } },
        {
          $set: {
            [this.cfg.statusPath]: this.cfg.failedValue,
            [this.cfg.errorPath]: 'retry budget exhausted after repeated worker loss',
          },
          $unset: { [this.cfg.ownerPath]: 1, [this.cfg.heartbeatPath]: 1 },
        },
      )
      .exec();
    if (requeued.modifiedCount || exhausted.modifiedCount) {
      this.logger.warn(
        `recovery(${reason}): requeued=${requeued.modifiedCount} exhausted=${exhausted.modifiedCount}`,
      );
    }
  }

  /** Stop claiming, finish in-flight work. Bounded by the shutdown watchdog. */
  async drain(): Promise<void> {
    this.accepting = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    const pending = [...this.inFlight.values()];
    this.logger.log(`draining: ${pending.length} in-flight job(s)`);
    await Promise.allSettled(pending);
  }
}
