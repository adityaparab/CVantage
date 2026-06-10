import { HttpResponse, http as mswHttp } from 'msw';

import {
  adminUser,
  candidateUser,
  sampleAnalysis,
  sampleNotification,
  sampleResume,
} from './fixtures';

import type { Types } from '@/api/types';

const API = '/api/v1';

const page = <T>(items: T[]): Types.Page<T> => ({ items, total: items.length });

/** Default happy-path handlers per domain (issue #63 / 7.6). Tests override
 *  per-case with server.use(...). Typed against the wire DTOs - drift from
 *  the api/types contract is a compile error. */
export const handlers = [
  // auth
  mswHttp.get(`${API}/users/me`, () => HttpResponse.json<Types.AuthUser>(candidateUser)),
  mswHttp.post(`${API}/auth/login`, () =>
    HttpResponse.json<Types.LoginResponse>({ accessToken: 'jwt', user: candidateUser }),
  ),
  mswHttp.post(`${API}/auth/register`, () => HttpResponse.json<Types.AuthUser>(candidateUser)),
  mswHttp.post(`${API}/auth/logout`, () => HttpResponse.json({ ok: true })),
  mswHttp.post(`${API}/auth/refresh`, () => HttpResponse.json({ accessToken: 'jwt2' })),

  // resumes
  mswHttp.get(`${API}/resumes`, () =>
    HttpResponse.json<Types.Page<Types.ResumeListItem>>(page([sampleResume])),
  ),
  mswHttp.get(`${API}/resumes/:id`, () => HttpResponse.json<Types.ResumeDetail>(sampleResume)),
  mswHttp.get(`${API}/users/me/stats`, () =>
    HttpResponse.json<Types.UserStats>({ resumeCount: 1, analysisCount: 2 }),
  ),

  // analyses
  mswHttp.get(`${API}/analyses`, () =>
    HttpResponse.json<Types.Page<Types.Analysis>>(page([sampleAnalysis])),
  ),
  mswHttp.get(`${API}/analyses/:id`, () => HttpResponse.json<Types.Analysis>(sampleAnalysis)),
  mswHttp.post(`${API}/analyses`, () =>
    HttpResponse.json<Types.Analysis>({ ...sampleAnalysis, status: 'pending' }, { status: 201 }),
  ),

  // notifications
  mswHttp.get(`${API}/notifications`, () =>
    HttpResponse.json<Types.Page<Types.Notification>>(page([sampleNotification])),
  ),

  // admin
  mswHttp.get(`${API}/admin/stats`, () =>
    HttpResponse.json<Types.AdminStats>({
      users: 1280,
      resumes: 3411,
      analyses: 5120,
      generatedAt: new Date().toISOString(),
    }),
  ),
  mswHttp.get(`${API}/admin/users`, () =>
    HttpResponse.json<Types.Page<Types.AdminUserRow>>(
      page([
        {
          id: adminUser.id,
          fullName: adminUser.fullName,
          email: adminUser.email,
          role: 'admin',
          status: 'active',
          createdAt: '2026-06-01T00:00:00.000Z',
          resumeCount: 0,
          analysisCount: 0,
        },
      ]),
    ),
  ),
];

/** Auth-state switches for the render helper. */
export const authHandlers = {
  candidate: mswHttp.get(`${API}/users/me`, () => HttpResponse.json(candidateUser)),
  admin: mswHttp.get(`${API}/users/me`, () => HttpResponse.json(adminUser)),
  anonymous: mswHttp.get(`${API}/users/me`, () =>
    HttpResponse.json(
      { statusCode: 401, error: 'Unauthorized', message: 'No session' },
      { status: 401 },
    ),
  ),
};
