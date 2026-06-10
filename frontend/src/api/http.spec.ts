import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import { AUTH_EXPIRED_EVENT, http } from './http';

import { server } from '@/test/msw/server';

const API = '/api/v1';

describe('single-flight refresh (issue #61 / 7.4)', () => {
  it('3 parallel 401s -> exactly one refresh -> all replayed successfully', async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    server.use(
      mswHttp.get(`${API}/resumes`, () => {
        protectedCalls += 1;
        if (protectedCalls <= 3) {
          return HttpResponse.json(
            { statusCode: 401, error: 'Unauthorized', message: 'expired' },
            { status: 401 },
          );
        }
        return HttpResponse.json({ items: [], total: 0 });
      }),
      mswHttp.post(`${API}/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 50)); // let all 3 queue on it
        return HttpResponse.json({ accessToken: 'fresh' });
      }),
    );
    const results = await Promise.all([
      http.get(`/resumes`),
      http.get(`/resumes`),
      http.get(`/resumes`),
    ]);
    expect(refreshCalls).toBe(1);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(protectedCalls).toBe(6); // 3 failures + 3 replays
  });

  it('refresh failure fires AUTH_EXPIRED_EVENT and surfaces the original 401', async () => {
    server.use(
      mswHttp.get(`${API}/resumes`, () =>
        HttpResponse.json(
          { statusCode: 401, error: 'Unauthorized', message: 'expired' },
          { status: 401 },
        ),
      ),
      mswHttp.post(`${API}/auth/refresh`, () =>
        HttpResponse.json(
          { statusCode: 401, error: 'Unauthorized', message: 'no refresh' },
          { status: 401 },
        ),
      ),
    );
    let fired = false;
    const listener = () => {
      fired = true;
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    await expect(http.get('/resumes')).rejects.toMatchObject({
      response: { status: 401 },
    });
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    expect(fired).toBe(true);
  });

  it('auth endpoints themselves are never refresh-looped', async () => {
    let refreshCalls = 0;
    server.use(
      mswHttp.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, error: 'Unauthorized', message: 'bad creds' },
          { status: 401 },
        ),
      ),
      mswHttp.post(`${API}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({});
      }),
    );
    await expect(http.post('/auth/login', {})).rejects.toBeDefined();
    expect(refreshCalls).toBe(0);
  });
});
