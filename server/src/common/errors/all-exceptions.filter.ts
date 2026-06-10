import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config';

import type { ErrorEnvelope } from './error-envelope';

interface MongoServerLikeError {
  name?: string;
  code?: number;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { path?: string; message?: string }>;
  message?: string;
  stack?: string;
}

const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  422: 'Validation Failed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * Global error boundary (issue #14 / 1.5): every failure — HttpException,
 * domain AppException, mongoose/Mongo errors, or unknown throw — leaves the
 * API as the same ErrorEnvelope. 5xx internals are hidden in production and
 * logged exactly once with stack.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string | number }>();

    const { status, error, message, details } = this.normalize(exception);

    const envelope: ErrorEnvelope = {
      statusCode: status,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(req.id !== undefined ? { requestId: String(req.id) } : {}),
      timestamp: new Date().toISOString(),
      path: req.originalUrl ?? req.url,
    };

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error({ err: exception, stack, requestId: envelope.requestId }, message);
    } else {
      this.logger.debug({ status, requestId: envelope.requestId }, `${error}: ${message}`);
    }

    const retryAfterS = (details as { retryAfterS?: number } | undefined)?.retryAfterS;
    if (status === 429 && typeof retryAfterS === 'number') {
      res.setHeader('Retry-After', String(retryAfterS));
    }
    res.status(status).json(envelope);
  }

  private normalize(exception: unknown): {
    status: number;
    error: string;
    message: string;
    details?: unknown;
  } {
    // Nest HttpException (incl. AppException and the zod pipe's 422)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return { status, error: STATUS_NAMES[status] ?? exception.name, message: body };
      }
      const rec = body as Record<string, unknown>;
      return {
        status,
        error: (rec.error as string) ?? STATUS_NAMES[status] ?? exception.name,
        message: Array.isArray(rec.message)
          ? (rec.message as string[]).join('; ')
          : ((rec.message as string) ?? exception.message),
        details: rec.details,
      };
    }

    const err = exception as MongoServerLikeError & {
      status?: number;
      statusCode?: number;
      code?: number | string;
    };

    // Multer upload failures (size cap, unexpected fields)
    if (err?.name === 'MulterError') {
      const tooLarge = String(err.code) === 'LIMIT_FILE_SIZE';
      return {
        status: tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
        error: tooLarge ? 'Payload Too Large' : 'Bad Request',
        message: tooLarge ? 'File exceeds the 10MB limit' : (err.message ?? 'Upload failed'),
      };
    }

    // Express/http-errors middleware failures (body-parser 413, malformed JSON 400, …)
    const middlewareStatus = err?.status ?? err?.statusCode;
    if (typeof middlewareStatus === 'number' && middlewareStatus >= 400 && middlewareStatus < 500) {
      return {
        status: middlewareStatus,
        error: STATUS_NAMES[middlewareStatus] ?? 'Request Error',
        message: err.message ?? 'Request could not be processed',
      };
    }

    // Mongo duplicate key → 409
    if (err?.code === 11000) {
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'A record with the same unique value already exists',
        details: err.keyValue ? { duplicate: Object.keys(err.keyValue) } : undefined,
      };
    }
    // Optimistic concurrency (mongoose VersionError) → 409
    if (err?.name === 'VersionError') {
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'The record was modified by another request — reload and retry',
        details: { conflict: 'version' },
      };
    }
    // Mongoose validation → 422 with field paths
    if (err?.name === 'ValidationError' && err.errors) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Validation Failed',
        message: 'Document validation failed',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      };
    }
    // Mongoose cast errors (bad ObjectId etc.) → 400
    if (err?.name === 'CastError') {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Malformed identifier or value',
      };
    }

    // Unknown → 500; internals only outside production
    const raw = exception instanceof Error ? exception.message : String(exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: this.config.core.isProd ? 'Something went wrong' : raw,
    };
  }
}
