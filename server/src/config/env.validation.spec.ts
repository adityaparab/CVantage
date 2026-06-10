import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEV_DEFAULTS, ENV_KEYS, validateEnv } from './env.validation';

describe('env validation (issue #11 / 1.2)', () => {
  const minimal = {}; // every required key has a dev default

  it('accepts an empty env in development (defaults apply)', () => {
    const env = validateEnv(minimal);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toContain('mongodb://');
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.MAIL_DRIVER).toBe('console');
  });

  it('parses and coerces typed values', () => {
    const env = validateEnv({
      PORT: '8080',
      SWAGGER_ENABLED: 'false',
      LLM_TIMEOUT_MS: '30000',
      CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.LLM_TIMEOUT_MS).toBe(30000);
  });

  describe('named-key failures', () => {
    it.each([
      ['MONGODB_URI', { MONGODB_URI: 'postgres://nope' }],
      ['PORT', { PORT: 'not-a-number' }],
      ['APP_BASE_URL', { APP_BASE_URL: 'not a url' }],
      ['JWT_ACCESS_TTL', { JWT_ACCESS_TTL: '15minutes' }],
      ['MASTER_ENCRYPTION_KEY', { MASTER_ENCRYPTION_KEY: 'too-short' }],
      ['ADMIN_EMAIL', { ADMIN_EMAIL: 'not-an-email' }],
    ])('rejects bad %s and names it', (key, overrides) => {
      expect(() => validateEnv(overrides)).toThrow(new RegExp(`- ${key}:`));
    });
  });

  describe('cross-field invariants', () => {
    it('rejects an OAuth half-pair, naming the missing half', () => {
      expect(() => validateEnv({ GOOGLE_CLIENT_ID: 'id-only' })).toThrow(/GOOGLE_CLIENT_SECRET/);
      expect(() => validateEnv({ LINKEDIN_CLIENT_SECRET: 'secret-only' })).toThrow(
        /LINKEDIN_CLIENT_ID/,
      );
    });

    it('accepts complete OAuth pairs', () => {
      const env = validateEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' });
      expect(env.GOOGLE_CLIENT_ID).toBe('id');
    });

    it('requires S3 settings when STORAGE_DRIVER=s3', () => {
      expect(() => validateEnv({ STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    });

    it('requires SMTP settings when MAIL_DRIVER=smtp', () => {
      expect(() => validateEnv({ MAIL_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);
    });

    it('rejects dev-default secrets in production, naming each', () => {
      const run = () => validateEnv({ NODE_ENV: 'production' });
      expect(run).toThrow(/JWT_ACCESS_SECRET/);
      expect(run).toThrow(/MASTER_ENCRYPTION_KEY/);
      expect(run).toThrow(/dev default rejected/);
    });

    it('accepts production with explicit secrets', () => {
      const env = validateEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a'.repeat(48),
        JWT_REFRESH_SECRET: 'b'.repeat(48),
        COOKIE_SECRET: 'c'.repeat(48),
        MASTER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      });
      expect(env.NODE_ENV).toBe('production');
    });
  });

  describe('.env.example parity (every key documented, no strays)', () => {
    const examplePath = resolve(__dirname, '../../../.env.example');
    const exampleKeys = readFileSync(examplePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^#?\s*([A-Z][A-Z0-9_]+)=/)?.[1])
      .filter((k): k is string => Boolean(k))
      // VITE_* keys are client-side (vite injects them; the server never reads them)
      .filter((k) => !k.startsWith('VITE_'));

    it('documents every schema key', () => {
      const missing = ENV_KEYS.filter((k) => !exampleKeys.includes(k));
      expect(missing).toEqual([]);
    });

    it('contains no keys unknown to the schema', () => {
      const strays = exampleKeys.filter((k) => !ENV_KEYS.includes(k));
      expect(strays).toEqual([]);
    });

    it('never ships real-looking secrets', () => {
      const content = readFileSync(examplePath, 'utf8');
      expect(content).not.toMatch(/sk-[A-Za-z0-9]{20}/);
      for (const v of Object.values(DEV_DEFAULTS)) {
        expect(content).not.toContain(v);
      }
    });
  });
});
