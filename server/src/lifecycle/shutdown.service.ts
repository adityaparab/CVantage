import { BeforeApplicationShutdown, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config';

export type DrainHook = () => Promise<void>;

/**
 * Graceful shutdown coordination (issue #17 / 1.8).
 *
 * SIGTERM/SIGINT (enableShutdownHooks in app.setup) →
 *   1. Nest stops accepting connections and lets in-flight requests finish
 *   2. beforeApplicationShutdown: drain hooks run (job runner registers one
 *      in #41 so running analyses finish before exit)
 *   3. onApplicationShutdown: modules close (Mongoose disconnects itself)
 *
 * A watchdog bounds the whole sequence with SHUTDOWN_TIMEOUT_MS — a hung
 * hook ends in process.exit(1) instead of a zombie deploy.
 */
@Injectable()
export class ShutdownService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly drainHooks: DrainHook[] = [];
  private watchdog?: NodeJS.Timeout;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShutdownService.name);
  }

  /** Long-running subsystems (job runner, SSE hub) register their drain here. */
  registerDrainHook(hook: DrainHook): void {
    this.drainHooks.push(hook);
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    const timeoutMs = this.config.core.shutdownTimeoutMs;
    this.logger.info({ signal, timeoutMs, hooks: this.drainHooks.length }, 'shutdown started');

    this.watchdog = setTimeout(() => {
      this.logger.fatal({ timeoutMs }, 'shutdown watchdog expired — forcing exit');
      this.exit(1);
    }, timeoutMs);
    this.watchdog.unref();

    for (const hook of this.drainHooks) {
      await hook();
    }
  }

  onApplicationShutdown(signal?: string): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.logger.info({ signal }, 'shutdown complete');
  }

  /** Wrapped for testability. */
  exit(code: number): void {
    process.exit(code);
  }
}
