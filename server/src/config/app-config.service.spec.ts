import { ConfigService } from '@nestjs/config';

import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

/** Exercises every config group against validated defaults (issue #19 coverage). */
describe('AppConfigService groups', () => {
  const make = (raw: Record<string, string> = {}): AppConfigService =>
    new AppConfigService(new ConfigService(validateEnv(raw)));

  it('core derives flags, parses cors list and applies swagger default', () => {
    const c = make({ CORS_ORIGINS: ' http://a.test , http://b.test ' }).core;
    expect(c.isDev).toBe(true);
    expect(c.isProd).toBe(false);
    expect(c.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
    expect(c.swaggerEnabled).toBe(true);
    expect(c.healthMemHeapMb).toBeGreaterThan(0);
  });

  it('mongo, auth and crypto groups surface validated values', () => {
    const s = make();
    expect(s.mongo.uri).toContain('mongodb://');
    expect(s.auth.accessTtl).toBe('15m');
    expect(Buffer.from(s.crypto.masterKeyBase64, 'base64')).toHaveLength(32);
  });

  it('oauth groups are undefined without pairs and populated with them', () => {
    expect(make().oauth.google).toBeUndefined();
    const withGoogle = make({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' }).oauth;
    expect(withGoogle.google).toEqual({ clientId: 'id', clientSecret: 'sec' });
    expect(withGoogle.linkedin).toBeUndefined();
    expect(withGoogle.callbackBaseUrl).toContain('http');
  });

  it('storage, llm, mail, throttle, seed and observability groups expose defaults', () => {
    const s = make();
    expect(s.storage.driver).toBe('local');
    expect(s.llm.provider).toBe('openai');
    expect(s.llm.timeoutMs).toBe(60_000);
    expect(s.mail.driver).toBe('console');
    expect(s.throttle.limit).toBeGreaterThan(0);
    expect(s.seed.adminEmail).toBeUndefined();
    expect(s.observability.otelServiceName).toBe('cvantage-api');
    expect(s.observability.langsmithTracing).toBe(false);
  });
});
