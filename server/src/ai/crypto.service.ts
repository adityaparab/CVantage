import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config';

/** Typed decrypt failure — callers must treat the payload as gone, never partial. */
export class DecryptionFailedError extends Error {
  constructor(reason: string) {
    super(`Decryption failed: ${reason}`);
    this.name = 'DecryptionFailedError';
  }
}

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * AES-256-GCM envelope for provider API keys at rest (issue #38 / 4.1).
 * Ciphertext format: `iv.tag.data` (base64 segments). A fresh random IV per
 * encryption; the GCM auth tag makes any tampering a hard typed failure.
 * MASTER_ENCRYPTION_KEY is validated at boot (#11) — this re-asserts.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    const raw = Buffer.from(config.crypto.masterKeyBase64, 'base64');
    if (raw.length !== KEY_BYTES) {
      throw new Error(
        `MASTER_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${raw.length})`,
      );
    }
    this.key = raw;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
  }

  decrypt(blob: string): string {
    const parts = blob.split('.');
    if (parts.length !== 3) throw new DecryptionFailedError('malformed ciphertext');
    const [ivB64, tagB64, dataB64] = parts as [string, string, string];
    try {
      const iv = Buffer.from(ivB64, 'base64');
      const decipher = createDecipheriv(ALGO, this.key, iv);
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]);
      return plain.toString('utf8');
    } catch {
      // never leak which stage failed, never return partial output
      throw new DecryptionFailedError('integrity check failed');
    }
  }
}
