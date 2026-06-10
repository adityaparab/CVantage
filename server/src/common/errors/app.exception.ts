import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for typed domain errors (issue #14 / 1.5).
 * Feature modules subclass this (e.g. ResumeNameTakenException) so the
 * filter can render consistent envelopes without string matching.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    error: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ error, message, details }, status);
  }
}
