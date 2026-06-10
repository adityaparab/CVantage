import { HttpResponse, http as mswHttp } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { adminApi } from './endpoints/admin';
import { analysesApi } from './endpoints/analyses';
import { authApi } from './endpoints/auth';
import { notificationsApi } from './endpoints/notifications';
import { resumesApi } from './endpoints/resumes';

import { sampleAnalysis, sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';

const API = '/api/v1';
const ID = sampleResume.id;

beforeEach(() => {
  server.use(
    mswHttp.post(`${API}/resumes`, () => HttpResponse.json(sampleResume, { status: 201 })),
    mswHttp.patch(`${API}/resumes/:id`, () => HttpResponse.json(sampleResume)),
    mswHttp.delete(`${API}/resumes/:id`, () => new HttpResponse(null, { status: 204 })),
    mswHttp.post(`${API}/resumes/upload`, () => HttpResponse.json(sampleResume, { status: 201 })),
    mswHttp.post(`${API}/resumes/:id/reparse`, () =>
      HttpResponse.json({ id: ID, uploadParse: { status: 'pending' } }, { status: 202 }),
    ),
    mswHttp.post(`${API}/analyses/:id/retry`, () => HttpResponse.json(sampleAnalysis)),
    mswHttp.post(`${API}/analyses/:id/cancel`, () =>
      HttpResponse.json({ ...sampleAnalysis, status: 'cancelled' }),
    ),
    mswHttp.post(`${API}/analyses/:id/suggestions/:sid/apply`, () =>
      HttpResponse.json({ outcome: 'applied', suggestion: sampleAnalysis.result!.suggestions![0] }),
    ),
    mswHttp.post(`${API}/analyses/:id/suggestions/:sid/dismiss`, () =>
      HttpResponse.json({ id: 'sid', dismissed: true }),
    ),
    mswHttp.post(`${API}/notifications/:id/clear`, () =>
      HttpResponse.json({ id: 'n1', state: 'cleared' }),
    ),
    mswHttp.post(`${API}/auth/forgot-password`, () => HttpResponse.json({})),
    mswHttp.post(`${API}/auth/reset-password`, () => HttpResponse.json({})),
    mswHttp.get(`${API}/admin/users/:id`, () =>
      HttpResponse.json({
        id: ID,
        fullName: 'X',
        email: 'x@y.z',
        role: 'candidate',
        status: 'active',
        createdAt: '',
        resumeCount: 0,
        analysisCount: 0,
      }),
    ),
    mswHttp.patch(`${API}/admin/users/:id`, () =>
      HttpResponse.json({
        id: ID,
        fullName: 'Y',
        email: 'x@y.z',
        role: 'candidate',
        status: 'active',
        createdAt: '',
        resumeCount: 0,
        analysisCount: 0,
      }),
    ),
    mswHttp.post(`${API}/admin/users/:id/reset-password`, () =>
      HttpResponse.json({ mode: 'temporary', temporaryPassword: 'tmp-1234' }),
    ),
    mswHttp.post(`${API}/admin/users/:id/deactivate`, () =>
      HttpResponse.json({ id: ID, status: 'deactivated' }),
    ),
    mswHttp.post(`${API}/admin/users/:id/reactivate`, () =>
      HttpResponse.json({ id: ID, status: 'active' }),
    ),
    mswHttp.get(`${API}/admin/users/:id/resumes`, () => HttpResponse.json({ items: [], total: 0 })),
    mswHttp.delete(`${API}/admin/resumes/:id`, () =>
      HttpResponse.json({ resumeDeleted: true, analysesDeleted: 1 }),
    ),
    mswHttp.get(`${API}/admin/models`, () => HttpResponse.json([])),
    mswHttp.post(`${API}/admin/models`, () =>
      HttpResponse.json(
        {
          id: 'm1',
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKeyMasked: '••••3kF9',
          usages: ['analysis'],
          status: 'active',
        },
        { status: 201 },
      ),
    ),
    mswHttp.patch(`${API}/admin/models/:id`, () =>
      HttpResponse.json({
        id: 'm1',
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKeyMasked: '••••3kF9',
        usages: ['analysis'],
        status: 'disabled',
      }),
    ),
    mswHttp.post(`${API}/admin/models/:id/rotate-key`, () =>
      HttpResponse.json({
        id: 'm1',
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKeyMasked: '••••ZZ77',
        usages: ['analysis'],
        status: 'active',
      }),
    ),
    mswHttp.delete(`${API}/admin/models/:id`, () => new HttpResponse(null, { status: 204 })),
  );
});

describe('mutation wrappers (issue #61 / 7.4)', () => {
  it('resume mutations', async () => {
    expect((await resumesApi.create({ name: 'R', jsonResume: {} })).id).toBe(ID);
    expect((await resumesApi.update(ID, { name: 'R2', version: 1 })).id).toBe(ID);
    await expect(resumesApi.remove(ID)).resolves.toBeUndefined();
    const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
    expect((await resumesApi.upload(file)).id).toBe(ID);
    expect((await resumesApi.reparse(ID)).id).toBe(ID);
  });

  it('analysis + notification + auth-extra mutations', async () => {
    expect((await analysesApi.retry('a')).id).toBeDefined();
    expect((await analysesApi.cancel('a')).status).toBe('cancelled');
    expect((await analysesApi.applySuggestion('a', 's')).outcome).toBe('applied');
    expect((await analysesApi.dismissSuggestion('a', 's')).dismissed).toBe(true);
    expect((await notificationsApi.clear('n')).state).toBe('cleared');
    await expect(authApi.forgotPassword('a@b.c')).resolves.toBeUndefined();
    await expect(authApi.resetPassword('tok', 'NewPass-99')).resolves.toBeUndefined();
    await expect(
      authApi.register({ email: 'a@b.c', password: 'x', fullName: 'A' }),
    ).resolves.toBeDefined();
  });

  it('admin wrappers', async () => {
    expect((await adminApi.user(ID)).id).toBe(ID);
    expect((await adminApi.updateUser(ID, { fullName: 'Y' })).fullName).toBe('Y');
    expect((await adminApi.resetPassword(ID, 'temporary')).temporaryPassword).toBeDefined();
    expect((await adminApi.deactivate(ID)).status).toBe('deactivated');
    expect((await adminApi.reactivate(ID)).status).toBe('active');
    expect((await adminApi.userResumes(ID)).total).toBe(0);
    expect((await adminApi.deleteResume(ID)).resumeDeleted).toBe(true);
    expect(await adminApi.models()).toEqual([]);
    expect(
      (
        await adminApi.addModel({
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: 'sk-x',
          usages: ['analysis'],
        })
      ).apiKeyMasked,
    ).toContain('3kF9');
    expect((await adminApi.patchModel('m1', { status: 'disabled' })).status).toBe('disabled');
    expect((await adminApi.rotateModelKey('m1', 'sk-new')).apiKeyMasked).toContain('ZZ77');
    await expect(adminApi.removeModel('m1')).resolves.toBeUndefined();
  });
});
