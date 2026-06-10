import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from './error-envelope.dto';

const DESCRIPTIONS: Record<number, string> = {
  400: 'Malformed request (bad identifiers, broken JSON, middleware rejection)',
  401: 'Missing or invalid credentials',
  403: 'Authenticated but not allowed (role or account status)',
  404: 'Resource does not exist or is not yours',
  409: 'State conflict (duplicate value, version conflict, illegal transition)',
  410: 'Resource is gone (soft-deleted)',
  413: 'Body exceeds the configured size limit',
  422: 'Validation failed — details lists exact field paths',
  429: 'Rate limit exceeded — respect Retry-After',
  500: 'Unexpected failure — message is generic in production',
};

const EXAMPLES: Record<number, object> = {
  422: {
    statusCode: 422,
    error: 'Validation Failed',
    message: 'Request validation failed',
    details: [{ path: 'basics.email', message: 'Invalid email' }],
    requestId: 'b6e7c0d1-2f3a-4b5c-8d9e-0f1a2b3c4d5e',
    timestamp: '2026-06-10T12:34:56.789Z',
    path: '/api/v1/resumes',
  },
  429: {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded',
    requestId: 'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    timestamp: '2026-06-10T12:34:56.789Z',
    path: '/api/v1/auth/login',
  },
};

/**
 * Documents the error statuses an endpoint can emit, all referencing the
 * shared envelope schema (#18 documentation contract). Usage:
 *   @ApiStandardErrors(404, 409, 422)
 * 429 and 500 are always documented (global throttler + error boundary).
 */
export function ApiStandardErrors(...statuses: HttpStatus[]): MethodDecorator & ClassDecorator {
  const all = [
    ...new Set([...statuses, HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR]),
  ].sort();
  return applyDecorators(
    ...all.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? 'Error',
        schema: { $ref: getSchemaPath(ErrorEnvelopeDto) },
        ...(EXAMPLES[status] ? { example: EXAMPLES[status] } : {}),
      }),
    ),
  );
}
