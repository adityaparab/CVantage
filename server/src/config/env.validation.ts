import { z } from 'zod';

/**
 * Single source of truth for every environment variable the server consumes.
 * Validated once at boot — invalid or missing configuration fails fast with
 * the offending keys named (issue #11 / 1.2).
 *
 * Conventions:
 *  - optional() = feature is flagged off when absent (OAuth, S3, SMTP, observability)
 *  - dev/test defaults exist where safe; production refuses placeholder secrets
 */

const booleanish = z
  .string()
  .transform((v) => ['true', '1', 'yes', 'on'].includes(v.toLowerCase()))
  .or(z.boolean());

const intString = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);

/** Deterministic non-production fallbacks — rejected when NODE_ENV=production. */
export const DEV_DEFAULTS = {
  JWT_ACCESS_SECRET: 'dev-only-access-secret-change-me-0123456789abcdef',
  JWT_REFRESH_SECRET: 'dev-only-refresh-secret-change-me-0123456789abcdef',
  COOKIE_SECRET: 'dev-only-cookie-secret-change-me-0123456789abcdef',
  // base64 of 32 bytes of 0x42 — usable for local crypto, never for production.
  MASTER_ENCRYPTION_KEY: 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=',
} as const;

const envObjectSchema = z.object({
  /* ----------------------------- core ----------------------------- */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intString(3000, 1),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  SWAGGER_ENABLED: booleanish.optional(),
  SHUTDOWN_TIMEOUT_MS: intString(25_000, 1_000),
  HEALTH_MEM_HEAP_MB: intString(512, 64),
  HEALTH_DISK_PERCENT: z.coerce.number().min(0.5).max(0.99).default(0.9),

  /* ----------------------------- mongo ---------------------------- */
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\/.+/, 'must be a mongodb:// or mongodb+srv:// URI')
    .default('mongodb://localhost:27017/cvantage'),

  /* ----------------------------- auth ----------------------------- */
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_DEFAULTS.JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_DEFAULTS.JWT_REFRESH_SECRET),
  COOKIE_SECRET: z.string().min(32).default(DEV_DEFAULTS.COOKIE_SECRET),
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'e.g. 15m, 1h')
    .default('15m'),
  JWT_REFRESH_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'e.g. 30d')
    .default('30d'),

  /* ------------------- oauth (feature-flagged pairs) --------------- */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_CALLBACK_BASE_URL: z.string().url().optional(),

  /* ---------------------------- crypto ---------------------------- */
  MASTER_ENCRYPTION_KEY: z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'must be base64 of exactly 32 bytes')
    .default(DEV_DEFAULTS.MASTER_ENCRYPTION_KEY),

  /* ------------------------- seed (scripts) ----------------------- */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional(),

  /* ---------------------------- storage --------------------------- */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  /* ------------------------------ llm ----------------------------- */
  LLM_PROVIDER: z.enum(['openai', 'fake']).default('openai'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  LLM_PARSING_MODEL: z.string().min(1).default('gpt-4o-mini'),
  LLM_ANALYSIS_MODEL: z.string().min(1).default('gpt-4o'),
  LLM_TIMEOUT_MS: intString(60_000, 1_000),
  LLM_MAX_RETRIES: intString(2, 0),
  LLM_MAX_TOKENS_PARSING: z.coerce.number().int().min(256).max(32_000).default(8192),
  LLM_MAX_TOKENS_ANALYSIS: z.coerce.number().int().min(256).max(32_000).default(4096),
  LLM_USER_CONCURRENCY: intString(2, 1),

  /* ----------------------------- mail ----------------------------- */
  MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  /* --------------------------- throttling -------------------------- */
  THROTTLE_TTL_S: intString(60, 1),
  THROTTLE_LIMIT: intString(120, 1),
  THROTTLE_AUTH_LIMIT: intString(10, 1),
  THROTTLE_UPLOAD_LIMIT: intString(10, 1),
  EXPORT_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  ADMIN_STATS_CACHE_S: z.coerce.number().int().min(0).max(3600).default(60),
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(50).max(60_000).default(15_000),
  SSE_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().min(1).max(50).default(5),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  THROTTLE_ANALYSIS_LIMIT: intString(10, 1),
  LOCKOUT_MAX_FAILURES: intString(5, 1),
  LOCKOUT_WINDOW_S: intString(900, 10),
  LOCKOUT_BASE_BLOCK_S: intString(60, 5),
  LOCKOUT_MAX_BLOCK_S: intString(3600, 60),

  /* ------------------- observability (all optional) ---------------- */
  SENTRY_DSN: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('cvantage-api'),
  LANGSMITH_TRACING: booleanish.optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_ENDPOINT: z.string().url().optional(),
  LANGSMITH_PROJECT: z.string().min(1).optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
});

/* --------------------- cross-field invariants ---------------------- */
export const envSchema = envObjectSchema.superRefine((env, ctx) => {
  const pair = (a: keyof typeof env, b: keyof typeof env, name: string): void => {
    if (Boolean(env[a]) !== Boolean(env[b])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [env[a] ? (b as string) : (a as string)],
        message: `${name} OAuth requires both ${String(a)} and ${String(b)} (or neither)`,
      });
    }
  };
  pair('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'Google');
  pair('LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LinkedIn');

  if (env.STORAGE_DRIVER === 's3') {
    for (const k of [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const) {
      if (!env[k]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: 'required when STORAGE_DRIVER=s3',
        });
      }
    }
  }

  if (env.MAIL_DRIVER === 'smtp') {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'] as const) {
      if (!env[k]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: 'required when MAIL_DRIVER=smtp',
        });
      }
    }
  }

  if (env.NODE_ENV === 'production') {
    for (const [key, devValue] of Object.entries(DEV_DEFAULTS)) {
      if (env[key as keyof typeof env] === devValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'production requires an explicit value (dev default rejected)',
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** All keys the schema knows — used by the .env.example parity test. */
export const ENV_KEYS = Object.keys(envObjectSchema.shape) as readonly string[];

/**
 * Validates raw env; throws a single readable error naming every offending key.
 * Wired into @nestjs/config's `validate` hook → boot fails fast.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
