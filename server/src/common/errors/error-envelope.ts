/**
 * The single error shape every CVantage API error uses (issue #14 / 1.5).
 * Documented in Swagger as the shared error schema (#18) and mirrored to
 * the client. Moves into @cvantage/shared with #31.
 */
export interface ErrorEnvelope {
  statusCode: number;
  /** Machine-readable error name, e.g. "Not Found", "Validation Failed". */
  error: string;
  /** Human-readable message; generic for 5xx in production. */
  message: string;
  /** Structured context — zod/mongoose field issues, conflict info, etc. */
  details?: unknown;
  requestId?: string;
  timestamp: string;
  path: string;
}
