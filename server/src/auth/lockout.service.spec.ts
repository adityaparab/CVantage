import { Types } from 'mongoose';
import type { PinoLogger } from 'nestjs-pino';

import { LockoutService } from './lockout.service';

describe('LockoutService (issue #28 / 2.7)', () => {
  const config = {
    throttle: {
      ttlSeconds: 60,
      authLimit: 3,
      lockout: { maxFailures: 3, windowS: 900, baseBlockS: 60, maxBlockS: 3600 },
    },
  };
  const audit = { record: jest.fn() };
  const logger = { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger;
  const knownUser = { _id: new Types.ObjectId() };
  const users = {
    findOne: jest.fn(({ email }: { email: string }) => ({
      exec: async () => (email === 'known@x.test' ? knownUser : null),
    })),
  };

  const make = () => new LockoutService(config as never, audit as never, users as never, logger);

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-10T12:00:00Z') });
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('engages after maxFailures and reports Retry-After; identical for unknown emails', async () => {
    const svc = make();
    for (let i = 0; i < 3; i++) await svc.recordFailure('ghost@x.test', '1.1.1.1');
    const check = svc.check('ghost@x.test', '1.1.1.1');
    expect(check.blocked).toBe(true);
    expect(check.retryAfterS).toBeGreaterThanOrEqual(59);
    expect(check.retryAfterS).toBeLessThanOrEqual(60);
    // unknown account: no audit row (no actor), but behavior identical
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audits lockouts for existing accounts', async () => {
    const svc = make();
    for (let i = 0; i < 3; i++) await svc.recordFailure('known@x.test', '2.2.2.2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.lockout', actorId: knownUser._id }),
    );
  });

  it('block escalates per episode (base · 2^(n-1), capped) and expires', async () => {
    const svc = make();
    for (let i = 0; i < 3; i++) await svc.recordFailure('a@x.test', '3.3.3.3');
    expect(svc.check('a@x.test', '3.3.3.3').retryAfterS).toBeLessThanOrEqual(60);

    jest.advanceTimersByTime(61_000); // first block expires
    expect(svc.check('a@x.test', '3.3.3.3').blocked).toBe(false);

    for (let i = 0; i < 3; i++) await svc.recordFailure('a@x.test', '3.3.3.3');
    const second = svc.check('a@x.test', '3.3.3.3');
    expect(second.retryAfterS).toBeGreaterThan(60); // episode 2 → 120s
    expect(second.retryAfterS).toBeLessThanOrEqual(120);
  });

  it('success clears the email bucket; other emails/IPs unaffected', async () => {
    const svc = make();
    await svc.recordFailure('a@x.test', '4.4.4.4');
    await svc.recordFailure('a@x.test', '4.4.4.4');
    svc.recordSuccess('a@x.test');
    // email bucket restarted (separate IP so the persistent per-IP counter —
    // which deliberately survives successes to stop rotating-email attacks —
    // does not interfere with this assertion)
    for (let i = 0; i < 2; i++) await svc.recordFailure('a@x.test', '4.4.4.5');
    expect(svc.check('a@x.test', '4.4.4.5').blocked).toBe(false);
    expect(svc.check('b@x.test', '5.5.5.5').blocked).toBe(false);
  });

  it('per-IP lockout triggers regardless of rotating emails', async () => {
    const svc = make();
    for (let i = 0; i < 3; i++) await svc.recordFailure(`u${i}@x.test`, '6.6.6.6');
    expect(svc.check('fresh@x.test', '6.6.6.6').blocked).toBe(true);
    expect(svc.check('fresh@x.test', '7.7.7.7').blocked).toBe(false);
  });

  it('hit(): plain request limiting for forgot-password (limit within window)', () => {
    const svc = make();
    for (let i = 0; i < 3; i++) {
      expect(svc.hit('forgot', 'a@x.test', '8.8.8.8').blocked).toBe(false);
    }
    const fourth = svc.hit('forgot', 'a@x.test', '8.8.8.8');
    expect(fourth.blocked).toBe(true);
    expect(fourth.retryAfterS).toBeGreaterThan(0);
    jest.advanceTimersByTime(61_000);
    expect(svc.hit('forgot', 'a@x.test', '8.8.8.8').blocked).toBe(false);
  });
});
