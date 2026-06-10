import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.validation';

/**
 * Typed, grouped access to validated configuration.
 * The only sanctioned way to read environment values outside `config/`
 * (enforced by the eslint `process.env` restriction).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get core() {
    const nodeEnv = this.get('NODE_ENV');
    return {
      nodeEnv,
      isProd: nodeEnv === 'production',
      isDev: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
      port: this.get('PORT'),
      appBaseUrl: this.get('APP_BASE_URL'),
      logLevel: this.get('LOG_LEVEL'),
      corsOrigins: this.get('CORS_ORIGINS')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      swaggerEnabled: this.get('SWAGGER_ENABLED') ?? nodeEnv !== 'production',
      shutdownTimeoutMs: this.get('SHUTDOWN_TIMEOUT_MS'),
      healthMemHeapMb: this.get('HEALTH_MEM_HEAP_MB'),
      healthDiskPercent: this.get('HEALTH_DISK_PERCENT'),
    };
  }

  get mongo() {
    return { uri: this.get('MONGODB_URI') };
  }

  get auth() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      cookieSecret: this.get('COOKIE_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
    };
  }

  get oauth() {
    const callbackBaseUrl = this.get('OAUTH_CALLBACK_BASE_URL') ?? this.get('APP_BASE_URL');
    const google = this.get('GOOGLE_CLIENT_ID')
      ? {
          clientId: this.get('GOOGLE_CLIENT_ID') as string,
          clientSecret: this.get('GOOGLE_CLIENT_SECRET') as string,
        }
      : undefined;
    const linkedin = this.get('LINKEDIN_CLIENT_ID')
      ? {
          clientId: this.get('LINKEDIN_CLIENT_ID') as string,
          clientSecret: this.get('LINKEDIN_CLIENT_SECRET') as string,
        }
      : undefined;
    return { callbackBaseUrl, google, linkedin };
  }

  get crypto() {
    return { masterKeyBase64: this.get('MASTER_ENCRYPTION_KEY') };
  }

  get seed() {
    return { adminEmail: this.get('ADMIN_EMAIL'), adminPassword: this.get('ADMIN_PASSWORD') };
  }

  get storage() {
    return {
      driver: this.get('STORAGE_DRIVER'),
      uploadDir: this.get('UPLOAD_DIR'),
      s3: {
        endpoint: this.get('S3_ENDPOINT'),
        bucket: this.get('S3_BUCKET'),
        region: this.get('S3_REGION'),
        accessKeyId: this.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.get('S3_SECRET_ACCESS_KEY'),
      },
    };
  }

  get llm() {
    return {
      provider: this.get('LLM_PROVIDER'),
      openaiApiKey: this.get('OPENAI_API_KEY'),
      openaiBaseUrl: this.get('OPENAI_BASE_URL'),
      parsingModel: this.get('LLM_PARSING_MODEL'),
      analysisModel: this.get('LLM_ANALYSIS_MODEL'),
      timeoutMs: this.get('LLM_TIMEOUT_MS'),
      maxRetries: this.get('LLM_MAX_RETRIES'),
      userConcurrency: this.get('LLM_USER_CONCURRENCY'),
    };
  }

  get mail() {
    return {
      driver: this.get('MAIL_DRIVER'),
      smtp: {
        host: this.get('SMTP_HOST'),
        port: this.get('SMTP_PORT'),
        user: this.get('SMTP_USER'),
        pass: this.get('SMTP_PASS'),
        from: this.get('SMTP_FROM'),
      },
    };
  }

  get throttle() {
    return {
      ttlSeconds: this.get('THROTTLE_TTL_S'),
      limit: this.get('THROTTLE_LIMIT'),
      authLimit: this.get('THROTTLE_AUTH_LIMIT'),
      uploadLimit: this.get('THROTTLE_UPLOAD_LIMIT'),
      analysisLimit: this.get('THROTTLE_ANALYSIS_LIMIT'),
      lockout: {
        maxFailures: this.get('LOCKOUT_MAX_FAILURES'),
        windowS: this.get('LOCKOUT_WINDOW_S'),
        baseBlockS: this.get('LOCKOUT_BASE_BLOCK_S'),
        maxBlockS: this.get('LOCKOUT_MAX_BLOCK_S'),
      },
    };
  }

  get observability() {
    return {
      sentryDsn: this.get('SENTRY_DSN'),
      otlpEndpoint: this.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
      otelServiceName: this.get('OTEL_SERVICE_NAME'),
      langsmithTracing: this.get('LANGSMITH_TRACING') ?? false,
      langsmithApiKey: this.get('LANGSMITH_API_KEY'),
      langfuse: {
        publicKey: this.get('LANGFUSE_PUBLIC_KEY'),
        secretKey: this.get('LANGFUSE_SECRET_KEY'),
        host: this.get('LANGFUSE_HOST'),
      },
    };
  }
}
