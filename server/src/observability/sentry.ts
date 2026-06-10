import { Logger } from '@nestjs/common';

/**
 * Sentry (issue #87 / 10.4): strictly env-gated. Without SENTRY_DSN nothing
 * is imported or initialized - zero runtime presence. Only 5xx-class errors
 * are captured (the global filter calls captureServerError); every event
 * passes the PII scrubber.
 */
type SentryModule = typeof import('@sentry/node');

let sentry: SentryModule | null = null;

const SENSITIVE_KEYS =
  /^(email|password|passwordhash|token|accesstoken|refreshtoken|apikey|authorization|cookie|jsonresume|originaltext|jobdescription|resumesnapshot)$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_RE = /\b(?:sk|ghp|github_pat|eyJ)[A-Za-z0-9._-]{8,}\b/g;

export function scrubValue(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(TOKEN_RE, '[token]');
}

/** Deep PII scrub - drops sensitive keys, masks emails/tokens in strings. */
export function scrubEvent<T>(event: T): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return scrubValue(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.test(key)) {
          out[key] = '[redacted]';
        } else {
          out[key] = walk(val);
        }
      }
      return out;
    }
    return node;
  };
  return walk(event) as T;
}

export async function initServerSentry(opts: {
  dsn?: string;
  environment: string;
}): Promise<boolean> {
  if (!opts.dsn) return false;
  const mod = await import('@sentry/node');
  mod.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: process.env.APP_VERSION ?? undefined,
    tracesSampleRate: 0, // tracing belongs to OTel (#88)
    beforeSend: (event) => scrubEvent(event),
  });
  sentry = mod;
  new Logger('Sentry').log('error tracking enabled');
  return true;
}

/** Called by the global filter for 5xx-class failures only. */
export function captureServerError(
  err: unknown,
  context: { requestId?: string; path?: string; status: number },
): void {
  if (!sentry || context.status < 500) return;
  sentry.captureException(err, {
    tags: { requestId: context.requestId ?? 'unknown', status: String(context.status) },
    extra: { path: context.path },
  });
}

/** Test hook. */
export function _setSentryForTests(mod: { captureException: (...a: never[]) => void } | null): void {
  sentry = mod as never;
}
