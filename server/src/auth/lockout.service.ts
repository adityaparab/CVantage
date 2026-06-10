import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PinoLogger } from 'nestjs-pino';

import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config';
import { AuditAction, User } from '../database/schemas';

interface Bucket {
  failures: number[];
  blockedUntil: number;
  episodes: number;
}

export interface LockoutCheck {
  blocked: boolean;
  retryAfterS: number;
}

/**
 * Progressive credential-abuse lockout (issue #28 / 2.7).
 * In-memory by design (single instance per D7; swap for a shared store with
 * BullMQ/Redis later). Keys are per-EMAIL (as submitted — unknown accounts
 * behave identically, no oracle) and per-IP, blocked when EITHER trips.
 * Block escalates: base · 2^(episode-1), capped; success clears the email key.
 */
@Injectable()
export class LockoutService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LockoutService.name);
  }

  private get cfg(): {
    maxFailures: number;
    windowS: number;
    baseBlockS: number;
    maxBlockS: number;
  } {
    return this.config.throttle.lockout;
  }

  private bucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { failures: [], blockedUntil: 0, episodes: 0 };
      this.buckets.set(key, b);
      if (this.buckets.size > 50_000) {
        // size cap: drop the oldest entries (abuse hygiene, not precision)
        const first = this.buckets.keys().next().value as string;
        this.buckets.delete(first);
      }
    }
    return b;
  }

  check(email: string, ip: string): LockoutCheck {
    const now = Date.now();
    const candidates = [this.bucket(`e:${email.toLowerCase()}`), this.bucket(`i:${ip}`)];
    const blockedUntil = Math.max(...candidates.map((b) => b.blockedUntil));
    if (blockedUntil > now) {
      return { blocked: true, retryAfterS: Math.ceil((blockedUntil - now) / 1000) };
    }
    return { blocked: false, retryAfterS: 0 };
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const now = Date.now();
    const windowMs = this.cfg.windowS * 1000;
    for (const key of [`e:${email.toLowerCase()}`, `i:${ip}`]) {
      const b = this.bucket(key);
      b.failures = b.failures.filter((t) => now - t < windowMs);
      b.failures.push(now);
      if (b.failures.length >= this.cfg.maxFailures) {
        b.episodes += 1;
        const blockS = Math.min(this.cfg.baseBlockS * 2 ** (b.episodes - 1), this.cfg.maxBlockS);
        b.blockedUntil = now + blockS * 1000;
        b.failures = [];
        this.logger.warn({ key: key[0], blockS, episodes: b.episodes }, 'auth lockout engaged');
        if (key.startsWith('e:')) {
          const user = await this.users.findOne({ email: email.toLowerCase() }).exec();
          if (user) {
            await this.audit.record({
              action: AuditAction.AUTH_LOCKOUT,
              actorId: user._id,
              ip,
              meta: { blockS, episodes: b.episodes },
            });
          }
        }
      }
    }
  }

  recordSuccess(email: string): void {
    this.buckets.delete(`e:${email.toLowerCase()}`);
  }

  /** Plain request-count limiting for forgot/reset/register (per email+ip pair). */
  hit(scope: string, email: string, ip: string): LockoutCheck {
    const now = Date.now();
    const windowMs = this.config.throttle.ttlSeconds * 1000;
    const limit = this.config.throttle.authLimit;
    const b = this.bucket(`h:${scope}:${email.toLowerCase()}:${ip}`);
    b.failures = b.failures.filter((t) => now - t < windowMs);
    if (b.failures.length >= limit) {
      const retryAfterS = Math.ceil((b.failures[0]! + windowMs - now) / 1000);
      return { blocked: true, retryAfterS: Math.max(retryAfterS, 1) };
    }
    b.failures.push(now);
    return { blocked: false, retryAfterS: 0 };
  }
}
