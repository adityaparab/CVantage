import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** OWASP-baseline argon2id parameters — shared with the admin seed (#20). */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Password hashing + timing-safe verification (issue #22 / 2.1).
 * `verifyOrBurn` runs a real argon2 verification against a dummy hash when
 * the account does not exist, so unknown-email and wrong-password attempts
 * cost the same work (no user-enumeration timing oracle).
 */
@Injectable()
export class PasswordHasherService {
  private dummyHashPromise?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password).catch(() => false);
  }

  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hash('cvantage-dummy-timing-equalizer');
    return this.dummyHashPromise;
  }

  /** Verifies against the real hash, or burns equivalent work when absent. */
  async verifyOrBurn(hash: string | undefined, password: string): Promise<boolean> {
    if (hash) return this.verify(hash, password);
    await this.verify(await this.dummyHash(), password);
    return false;
  }
}
