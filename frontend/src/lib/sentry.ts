/**
 * Client Sentry (issue #87 / 10.4): lazy-initialized ONLY when
 * VITE_SENTRY_DSN is present - without it the SDK is never even imported
 * (separate chunk, zero network). PII scrubbed in beforeSend.
 */
const SENSITIVE_KEYS =
  /^(email|password|token|accesstoken|refreshtoken|apikey|authorization|cookie|jsonresume|originaltext|jobdescription)$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function scrubClientEvent<T>(event: T): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return node.replace(EMAIL_RE, '[email]');
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        out[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : walk(val);
      }
      return out;
    }
    return node;
  };
  return walk(event) as T;
}

export async function initClientSentry(): Promise<boolean> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? undefined,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubClientEvent(event),
  });
  return true;
}
