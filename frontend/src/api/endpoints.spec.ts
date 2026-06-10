import { describe, expect, it } from 'vitest';

import { adminApi } from './endpoints/admin';
import { analysesApi } from './endpoints/analyses';
import { authApi } from './endpoints/auth';
import { notificationsApi } from './endpoints/notifications';
import { resumesApi } from './endpoints/resumes';

/** Thin-wrapper contract smoke against the default MSW handlers (#63). */
describe('typed endpoint modules (issue #61 / 7.4)', () => {
  it('auth endpoints round-trip', async () => {
    expect((await authApi.me()).email).toContain('@');
    expect((await authApi.login({ email: 'a@b.c', password: 'x' })).user.role).toBeDefined();
    await expect(authApi.logout()).resolves.toBeUndefined();
  });

  it('resume endpoints round-trip', async () => {
    const page = await resumesApi.list({ page: 1 });
    expect(page.total).toBeGreaterThan(0);
    const detail = await resumesApi.get(page.items[0]!.id);
    expect(detail.jsonResume).toBeDefined();
    expect((await resumesApi.stats()).resumeCount).toBeGreaterThanOrEqual(0);
  });

  it('analysis endpoints round-trip', async () => {
    const page = await analysesApi.list({});
    expect(page.items[0]!.steps).toHaveLength(3);
    const one = await analysesApi.get(page.items[0]!.id);
    expect(one.result?.overallScore).toBeLessThanOrEqual(100);
    const created = await analysesApi.create({
      name: 'n',
      jobDescription: 'x'.repeat(40),
      resumeId: page.items[0]!.resumeId,
    });
    expect(created.status).toBe('pending');
  });

  it('notification + admin endpoints round-trip', async () => {
    expect((await notificationsApi.list()).items[0]!.type).toContain('analysis');
    expect((await adminApi.stats()).users).toBeGreaterThan(0);
    expect((await adminApi.users({})).items[0]!.role).toBe('admin');
  });
});
