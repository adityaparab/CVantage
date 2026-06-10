import { describe, expect, it } from 'vitest';

import { keys } from './keys';

describe('query-key factory (issue #61 / 7.4)', () => {
  it('keys are collision-free across domains', () => {
    const all = [
      keys.auth.me(),
      keys.resumes.all(),
      keys.resumes.list({ page: 1 }),
      keys.resumes.detail('a'),
      keys.resumes.stats(),
      keys.analyses.all(),
      keys.analyses.list({}),
      keys.analyses.detail('a'),
      keys.notifications.list(),
      keys.admin.stats(),
      keys.admin.users({}),
      keys.admin.user('a'),
      keys.admin.models(),
    ].map((k) => JSON.stringify(k));
    expect(new Set(all).size).toBe(all.length);
  });

  it('detail keys nest under their domain root for invalidation', () => {
    expect(keys.resumes.detail('x')[0]).toBe(keys.resumes.all()[0]);
    expect(keys.analyses.list({})[0]).toBe(keys.analyses.all()[0]);
  });
});
