import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { isToastable, normalizeApiError, toastMessage } from './errors';

const axios422 = () =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: {
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed',
      requestId: 'req-1',
      details: [{ path: 'work[0].startDate', message: 'Date must be YYYY, YYYY-MM or YYYY-MM-DD' }],
    },
  });

describe('error normalization (issue #61 / 7.4)', () => {
  it('422 envelopes expose typed fieldErrors and are NOT toastable', () => {
    const e = normalizeApiError(axios422());
    expect(e.status).toBe(422);
    expect(e.fieldErrors).toEqual([
      { path: 'work[0].startDate', message: 'Date must be YYYY, YYYY-MM or YYYY-MM-DD' },
    ]);
    expect(isToastable(e)).toBe(false);
  });

  it('5xx messages carry the requestId for support', () => {
    const err = new AxiosError('boom', 'ERR', undefined, undefined, {
      status: 500,
      statusText: 'Internal',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Unexpected',
        requestId: 'req-9',
      },
    });
    const e = normalizeApiError(err);
    expect(isToastable(e)).toBe(true);
    expect(toastMessage(e)).toContain('req-9');
  });

  it('network failures normalize without an envelope', () => {
    const e = normalizeApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(e.status).toBe(0);
    expect(e.message).toMatch(/server/i);
  });
});
