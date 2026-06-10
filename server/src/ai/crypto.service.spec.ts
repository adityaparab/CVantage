import { randomBytes } from 'node:crypto';

import { CryptoService, DecryptionFailedError } from './crypto.service';

const keyB64 = randomBytes(32).toString('base64');
const configWith = (masterKeyBase64: string) => ({ crypto: { masterKeyBase64 } });
const make = (k = keyB64) => new CryptoService(configWith(k) as never);

describe('CryptoService (issue #38 / 4.1)', () => {
  it('round-trips utf8 plaintext through iv.tag.data envelopes', () => {
    const svc = make();
    for (const plain of ['sk-test-1234', 'πβ∆ unicode ✓', 'a'.repeat(500)]) {
      const blob = svc.encrypt(plain);
      expect(blob.split('.')).toHaveLength(3);
      expect(svc.decrypt(blob)).toBe(plain);
    }
  });

  it('uses a fresh IV per encryption (same plaintext, different ciphertext)', () => {
    const svc = make();
    const a = svc.encrypt('same-secret');
    const b = svc.encrypt('same-secret');
    expect(a).not.toBe(b);
    expect(a.split('.')[0]).not.toBe(b.split('.')[0]);
  });

  it('tampered data or tag is a typed failure, never partial plaintext', () => {
    const svc = make();
    const [iv, tag, data] = svc.encrypt('super-secret').split('.') as [string, string, string];
    const flip = (s: string) => {
      const buf = Buffer.from(s, 'base64');
      buf[0] = (buf[0] as number) ^ 0xff;
      return buf.toString('base64');
    };
    for (const evil of [
      `${iv}.${tag}.${flip(data)}`,
      `${iv}.${flip(tag)}.${data}`,
      `${flip(iv)}.${tag}.${data}`,
      'only.two',
      'not-base64-at-all',
    ]) {
      expect(() => svc.decrypt(evil)).toThrow(DecryptionFailedError);
    }
  });

  it('a different master key cannot decrypt', () => {
    const blob = make().encrypt('cross-key');
    const other = make(randomBytes(32).toString('base64'));
    expect(() => other.decrypt(blob)).toThrow(DecryptionFailedError);
  });

  it('rejects master keys that are not exactly 32 bytes', () => {
    for (const bad of [
      randomBytes(16).toString('base64'),
      randomBytes(33).toString('base64'),
      '',
    ]) {
      expect(() => make(bad)).toThrow(/32 bytes/);
    }
  });

  it('error messages never contain plaintext or key material', () => {
    const svc = make();
    const blob = svc.encrypt('TOPSECRET-VALUE');
    try {
      svc.decrypt(blob.slice(0, -4) + 'AAAA');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('TOPSECRET');
      expect(msg).not.toContain(keyB64);
    }
  });
});
