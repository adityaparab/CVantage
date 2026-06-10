import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { AppException } from '../common';
import { AppConfigService } from '../config';
import { ShutdownService } from '../lifecycle/shutdown.service';

export interface SseConnection {
  send(event: string, data: unknown, id?: number): void;
  close(): void;
  readonly closed: boolean;
  onClose(fn: () => void): void;
}

/**
 * SSE connection hub (issue #49 / 5.2): per-user caps, proxy-safe headers,
 * heartbeats, and drain-on-shutdown. Controllers own WHAT to send; this owns
 * the plumbing.
 */
@Injectable()
export class SseHubService {
  private readonly logger = new Logger(SseHubService.name);
  private readonly perUser = new Map<string, Set<Response>>();
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly config: AppConfigService,
    shutdown: ShutdownService,
  ) {
    shutdown.registerDrainHook(() => this.drain());
  }

  /** Open a stream: cap check, headers, heartbeat registration. */
  open(userId: string, res: Response): SseConnection {
    const mine = this.perUser.get(userId) ?? new Set<Response>();
    if (mine.size >= this.config.sse.maxConnectionsPerUser) {
      throw new AppException(
        429,
        'Too Many Requests',
        `You already have ${mine.size} live event streams - close one first`,
        { limit: this.config.sse.maxConnectionsPerUser },
      );
    }
    mine.add(res);
    this.perUser.set(userId, mine);
    this.ensureHeartbeat();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    let closed = false;
    const closeFns: Array<() => void> = [];
    const cleanup = () => {
      if (closed) return;
      closed = true;
      mine.delete(res);
      if (mine.size === 0) this.perUser.delete(userId);
      for (const fn of closeFns) fn();
    };
    res.on('close', cleanup);

    return {
      get closed() {
        return closed;
      },
      send: (event, data, id) => {
        if (closed) return;
        const idLine = id === undefined ? '' : `id: ${id}\n`;
        res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close: () => {
        cleanup();
        res.end();
      },
      onClose: (fn) => closeFns.push(fn),
    };
  }

  get liveConnections(): number {
    let n = 0;
    for (const set of this.perUser.values()) n += set.size;
    return n;
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.liveConnections === 0) return;
      for (const set of this.perUser.values()) {
        for (const res of set) res.write(': ping\n\n');
      }
    }, this.config.sse.heartbeatMs);
    this.heartbeat.unref();
  }

  /** Graceful shutdown: end every stream so clients reconnect elsewhere. */
  async drain(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    let n = 0;
    for (const set of this.perUser.values()) {
      for (const res of set) {
        res.write('event: shutdown\ndata: {}\n\n');
        res.end();
        n += 1;
      }
    }
    this.perUser.clear();
    if (n > 0) this.logger.log(`drained ${n} SSE connection(s)`);
  }
}
