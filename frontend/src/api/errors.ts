import { AxiosError } from 'axios';

/** The server's global error envelope (AllExceptionsFilter). */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp?: string;
  path?: string;
}

export interface FieldIssue {
  path: string; // e.g. "work[0].startDate"
  message: string;
}

export interface NormalizedApiError {
  status: number;
  message: string;
  requestId?: string;
  /** Present on 422 - forms map these onto fields instead of toasting. */
  fieldErrors?: FieldIssue[];
  details?: unknown;
}

const isIssueArray = (d: unknown): d is FieldIssue[] =>
  Array.isArray(d) &&
  d.every((i) => typeof i === 'object' && i !== null && 'path' in i && 'message' in i);

/** One shape for every failure - network, envelope or unknown (issue #61). */
export function normalizeApiError(err: unknown): NormalizedApiError {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ErrorEnvelope | undefined;
    if (body && typeof body.message === 'string') {
      return {
        status: body.statusCode ?? err.response?.status ?? 0,
        message: body.message,
        requestId: body.requestId,
        details: body.details,
        fieldErrors:
          (body.statusCode === 422 || err.response?.status === 422) && isIssueArray(body.details)
            ? body.details
            : undefined,
      };
    }
    if (err.code === 'ECONNABORTED') {
      return { status: 0, message: 'The request timed out - try again' };
    }
    return { status: err.response?.status ?? 0, message: 'Could not reach the server' };
  }
  return { status: 0, message: err instanceof Error ? err.message : 'Something went wrong' };
}

/** Toast policy: 422s belong to forms; everything else is toastable. */
export const isToastable = (e: NormalizedApiError): boolean => e.status !== 422;

export const toastMessage = (e: NormalizedApiError): string =>
  e.requestId && e.status >= 500 ? `${e.message} (ref: ${e.requestId})` : e.message;
