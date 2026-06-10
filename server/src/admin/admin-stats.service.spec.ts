import { AdminStatsService } from './admin-stats.service';

const counting = (n: { users: number; resumes: number; analyses: number }) => {
  const make = (fn: () => number) => ({
    countDocuments: jest.fn((_f: Record<string, unknown>) => ({
      exec: jest.fn(async () => fn()),
    })),
  });
  return {
    users: make(() => n.users),
    resumes: make(() => n.resumes),
    analyses: make(() => n.analyses),
  };
};

const make = (n = { users: 10, resumes: 20, analyses: 30 }, cacheS = 60) => {
  const models = counting(n);
  const svc = new AdminStatsService(
    models.users as never,
    models.resumes as never,
    models.analyses as never,
    { admin: { statsCacheSeconds: cacheS } } as never,
  );
  return { svc, models, n };
};

describe('AdminStatsService (issue #52 / 6.1)', () => {
  afterEach(() => jest.useRealTimers());

  it('counts users (all), live resumes only, analyses all-time', async () => {
    const { svc, models } = make();
    const out = await svc.stats();
    expect(out).toMatchObject({ users: 10, resumes: 20, analyses: 30 });
    expect(models.resumes.countDocuments).toHaveBeenCalledWith({ deletedAt: null });
    expect(models.users.countDocuments).toHaveBeenCalledWith({});
    expect(models.analyses.countDocuments).toHaveBeenCalledWith({});
  });

  it('second call inside the window hits the cache (no extra counts)', async () => {
    jest.useFakeTimers();
    const { svc, models } = make();
    await svc.stats();
    await jest.advanceTimersByTimeAsync(30_000);
    await svc.stats();
    expect(models.users.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('window expiry refreshes the numbers', async () => {
    jest.useFakeTimers();
    const { svc, models } = make(undefined, 60);
    await svc.stats();
    await jest.advanceTimersByTimeAsync(61_000);
    await svc.stats();
    expect(models.users.countDocuments).toHaveBeenCalledTimes(2);
  });

  it('cache window of 0 disables caching', async () => {
    const { svc, models } = make(undefined, 0);
    await svc.stats();
    await svc.stats();
    expect(models.users.countDocuments).toHaveBeenCalledTimes(2);
  });
});
