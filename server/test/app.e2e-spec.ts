import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { configureApp } from '../src/app.setup';
import { setupSwagger } from '../src/docs/swagger.setup';
import type { ConsoleMailDriver } from '../src/mail/console.driver';
import { MailService } from '../src/mail/mail.service';

import { mongoAvailable, startMongo, type MongoTestContext } from './mongo-test.util';
import { consumeSse } from './sse-client';

/**
 * Full-application e2e against mongodb-memory-server (issue #19 / 1.10).
 * Boots the real AppModule — config, logging, db, throttler, filter, health.
 */
const RUN = process.env.CI === 'true' || process.env.FORCE_MONGO_E2E === 'true';

(RUN ? describe : describe.skip)('application e2e (real AppModule + in-memory mongo)', () => {
  jest.setTimeout(120_000);
  let mongo: MongoTestContext;
  let app: NestExpressApplication;

  beforeAll(async () => {
    if (!(await mongoAvailable())) {
      throw new Error('mongodb-memory-server unavailable in this environment');
    }
    mongo = await startMongo();
    process.env.MONGODB_URI = mongo.uri;
    process.env.LLM_PROVIDER = 'fake'; // D17: deterministic AI fixtures
    process.env.SSE_HEARTBEAT_MS = '200';
    process.env.SSE_MAX_CONNECTIONS_PER_USER = '2';
    process.env.ADMIN_STATS_CACHE_S = '1';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    // Import AFTER env so @nestjs/config validate sees the test URI.
    const { AppModule } = await import('../src/app.module.js');
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    configureApp(app);
    setupSwagger(app);
    await app.init();
    await app.listen(0); // raw-socket consumers (SSE e2e) need a bound port
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
    await mongo?.stop();
  });

  const http = () => request(app.getHttpServer() as App);
  const server = () => app.getHttpServer() as import('node:http').Server;

  it('GET /api/v1/health/live → 200', async () => {
    const res = await http().get('/api/v1/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });

  describe('analysis pipeline (issue #42 / 4.5, fake LLM)', () => {
    const creds = { email: 'analyst@e2e.test', fullName: 'Analyst', password: 'Engine-7311X' };
    let bearer = '';
    let resumeId = '';
    const auth = () => ({ Authorization: `Bearer ${bearer}` });
    const JD =
      'We are hiring a Senior Platform Engineer to own NestJS services, the MongoDB data layer and CI/CD.';

    const pollAnalysis = async (id: string, want: string, tries = 30) => {
      for (let i = 0; i < tries; i += 1) {
        const res = await http().get(`/api/v1/analyses/${id}`).set(auth()).expect(200);
        if (res.body.status === want) return res.body as Record<string, never>;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`analysis never reached ${want}`);
    };

    beforeAll(async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      bearer = login.body.accessToken as string;
      const r = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({
          name: 'Analysis Target',
          jsonResume: {
            basics: { name: 'Ada Lovelace', label: 'Senior Software Engineer' },
            work: [{ name: 'Analytical Engines Ltd', highlights: ['Cut compute time 40%'] }],
            skills: [{ name: 'TypeScript', keywords: ['NestJS', 'React'] }],
          },
        })
        .expect(201);
      resumeId = r.body.id as string;
    });

    it('full journey: pending -> 3 steps -> completed result within bounds', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'PE @ Acme', jobDescription: JD, resumeId })
        .expect(201);
      expect(created.body.status).toBe('pending');
      expect(created.body.steps).toHaveLength(3);

      const done = await pollAnalysis(created.body.id as string, 'completed');
      const body = done as unknown as {
        steps: Array<{ status: string }>;
        result: {
          overallScore: number;
          atsScore: number;
          suggestions: Array<{ fieldRef: string }>;
          interviewQuestions: unknown[];
        };
        durationMs: number;
        modelUsed: string;
      };
      expect(body.steps.every((s) => s.status === 'completed')).toBe(true);
      expect(body.result.overallScore).toBeGreaterThanOrEqual(0);
      expect(body.result.overallScore).toBeLessThanOrEqual(100);
      expect(body.result.atsScore).toBeLessThanOrEqual(100);
      expect(body.result.interviewQuestions.length).toBeGreaterThan(0);
      expect(body.result.suggestions.map((s) => s.fieldRef)).not.toContain('totally.fake[9].path');
      expect(body.durationMs).toBeGreaterThanOrEqual(0);
      expect(body.modelUsed).toBe('fake/fake-fixture');
      const tokens = (done as unknown as { tokensUsed: { totalTokens: number } }).tokensUsed;
      expect(tokens.totalTokens).toBeGreaterThan(0); // rollup across 3 steps (#44)

      const resume = await http().get(`/api/v1/resumes/${resumeId}`).set(auth()).expect(200);
      expect(resume.body.analysisStatus).toBe('completed');
      expect(resume.body.lastAnalyzedAt).toBeDefined();
    });

    it('step-2 failure: step-1 data intact, analysis + rollup failed', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({
          name: 'Doomed at step two',
          jobDescription: `${JD} !!FAIL_SUGGESTIONS!!`,
          resumeId,
        })
        .expect(201);
      const failed = await pollAnalysis(created.body.id as string, 'failed');
      const body = failed as unknown as {
        steps: Array<{ key: string; status: string }>;
        result?: { overallScore?: number; suggestions?: unknown[] };
        error?: string;
      };
      expect(body.steps[0]!.status).toBe('completed');
      expect(body.steps[1]!.status).toBe('failed');
      expect(body.result?.overallScore).toBe(72); // step-1 result preserved
      expect(body.result?.suggestions ?? []).toHaveLength(0);
      expect(String(body.error)).toMatch(/quota/i);
      const resume = await http().get(`/api/v1/resumes/${resumeId}`).set(auth()).expect(200);
      expect(resume.body.analysisStatus).toBe('failed');
    });

    it('validation: JD too short/long -> 422; foreign resume -> 404; empty resume -> 422', async () => {
      await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'short', jobDescription: 'x'.repeat(29), resumeId })
        .expect(422);
      await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'long', jobDescription: 'x'.repeat(50_001), resumeId })
        .expect(422);
      await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'foreign', jobDescription: JD, resumeId: '0'.repeat(24) })
        .expect(404);
      const empty = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Empty Shell', jsonResume: {} })
        .expect(201);
      await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'no content', jobDescription: JD, resumeId: empty.body.id })
        .expect(422);
    });


    it('docx export streams with the right headers (issue #81 / 9.4)', async () => {
      const res = await http()
        .get(`/api/v1/resumes/${resumeId}/export?format=docx`)
        .set(auth())
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('wordprocessingml');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=".+.docx"/);
      expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
      await http()
        .get(`/api/v1/resumes/${'0'.repeat(24)}/export?format=docx`)
        .set(auth())
        .expect(404);
      await http().get(`/api/v1/resumes/${resumeId}/export?format=exe`).set(auth()).expect(400);
    });

    it('suggestion apply/dismiss journey on the live resume (#43)', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'Apply journey', jobDescription: JD, resumeId })
        .expect(201);
      const done = await pollAnalysis(created.body.id as string, 'completed');
      const body = done as unknown as {
        id: string;
        result: { suggestions: Array<{ _id: string; fieldRef: string; proposedValue?: string }> };
      };
      const target = body.result.suggestions.find((s) => s.fieldRef === 'basics.label')!;
      expect(target).toBeDefined();

      const before = await http().get(`/api/v1/resumes/${resumeId}`).set(auth()).expect(200);
      const applied = await http()
        .post(`/api/v1/analyses/${body.id}/suggestions/${target._id}/apply`)
        .set(auth())
        .expect(201);
      expect(applied.body.outcome).toBe('applied');
      expect(applied.body.suggestion.applied).toBe(true);

      const after = await http().get(`/api/v1/resumes/${resumeId}`).set(auth()).expect(200);
      expect(after.body.jsonResume.basics.label).toBe('Senior Platform Engineer');
      expect(after.body.version).toBeGreaterThan(before.body.version as number); // OCC bumped
      expect(after.body.jsonResume.basics.name).toBe('Ada Lovelace'); // neighbors untouched

      const again = await http()
        .post(`/api/v1/analyses/${body.id}/suggestions/${target._id}/apply`)
        .set(auth())
        .expect(201);
      expect(again.body.outcome).toBe('already_applied');

      const noValue = body.result.suggestions.find((s) => !s.proposedValue)!;
      await http()
        .post(`/api/v1/analyses/${body.id}/suggestions/${noValue._id}/apply`)
        .set(auth())
        .expect(422);
      const dismissed = await http()
        .post(`/api/v1/analyses/${body.id}/suggestions/${noValue._id}/dismiss`)
        .set(auth())
        .expect(201);
      expect(dismissed.body.dismissed).toBe(true);
    });

    it('list + filters; state-machine 409s; foreign 404s (#43)', async () => {
      const page = await http()
        .get(`/api/v1/analyses?resumeId=${resumeId}&limit=5`)
        .set(auth())
        .expect(200);
      expect(page.body.total).toBeGreaterThanOrEqual(2);
      expect(page.body.items[0].result?.suggestions).toBeUndefined(); // slim rows
      const failedOnly = await http().get('/api/v1/analyses?status=failed').set(auth()).expect(200);
      expect(
        (failedOnly.body.items as Array<{ status: string }>).every((i) => i.status === 'failed'),
      ).toBe(true);

      const completedId = (page.body.items as Array<{ id: string; status: string }>).find(
        (i) => i.status === 'completed',
      )!.id;
      await http().post(`/api/v1/analyses/${completedId}/cancel`).set(auth()).expect(409);
      await http().post(`/api/v1/analyses/${completedId}/retry`).set(auth()).expect(409);

      const failedId = (failedOnly.body.items as Array<{ id: string }>)[0]!.id;
      const retried = await http()
        .post(`/api/v1/analyses/${failedId}/retry`)
        .set(auth())
        .expect(202);
      expect(retried.body.status).toBe('pending');
      await pollAnalysis(failedId, 'failed'); // deterministic marker fails it again

      const other = { email: 'analyst2@e2e.test', fullName: 'Other', password: 'Engine-7411X' };
      await http().post('/api/v1/auth/register').send(other).expect(201);
      const l2 = await http()
        .post('/api/v1/auth/login')
        .send({ email: other.email, password: other.password })
        .expect(200);
      await http()
        .get(`/api/v1/analyses/${completedId}`)
        .set({ Authorization: `Bearer ${l2.body.accessToken}` })
        .expect(404);
    });

    it('bell lifecycle: in-progress -> replaced on completion -> cleared by visit (#48)', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'Bell journey', jobDescription: JD, resumeId })
        .expect(201);
      const id = created.body.id as string;
      await pollAnalysis(id, 'completed');

      const bell = await http().get('/api/v1/notifications').set(auth()).expect(200);
      const mine = (bell.body.items as Array<Record<string, string>>).filter(
        (n) => n.analysisId === id,
      );
      expect(mine).toHaveLength(1); // replaced in place, never two rows
      expect(mine[0]!.type).toBe('analysis_completed');
      expect(mine[0]!.title).toContain('Bell journey');

      await http().get(`/api/v1/analyses/${id}`).set(auth()).expect(200); // visit rule
      await new Promise((r) => setTimeout(r, 300)); // fire-and-forget clear settles
      const after = await http().get('/api/v1/notifications').set(auth()).expect(200);
      expect(
        (after.body.items as Array<Record<string, string>>).filter((n) => n.analysisId === id),
      ).toHaveLength(0);
    });

    it('manual clear is idempotent; foreign clear is 404 (#48)', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'Doomed bell', jobDescription: `${JD} !!FAIL_COMPARE!!`, resumeId })
        .expect(201);
      await pollAnalysis(created.body.id as string, 'failed');
      const bell = await http().get('/api/v1/notifications').set(auth()).expect(200);
      const row = (bell.body.items as Array<Record<string, string>>).find(
        (n) => n.analysisId === created.body.id,
      )!;
      expect(row.type).toBe('analysis_failed');

      await http().post(`/api/v1/notifications/${row.id}/clear`).set(auth()).expect(201);
      await http().post(`/api/v1/notifications/${row.id}/clear`).set(auth()).expect(201); // idempotent

      const foe = { email: 'bell-foe@e2e.test', fullName: 'Foe', password: 'Engine-8811X' };
      await http().post('/api/v1/auth/register').send(foe).expect(201);
      const l = await http()
        .post('/api/v1/auth/login')
        .send({ email: foe.email, password: foe.password })
        .expect(200);
      await http()
        .post(`/api/v1/notifications/${row.id}/clear`)
        .set({ Authorization: `Bearer ${l.body.accessToken}` })
        .expect(404);
    });
  });

  describe('SSE streams (issue #49 / 5.2)', () => {
    const creds = { email: 'sse@e2e.test', fullName: 'Streamer', password: 'Engine-9111X' };
    let bearer = '';
    let cookie = '';
    let resumeId = '';
    const auth = () => ({ Authorization: `Bearer ${bearer}` });
    const JD = 'A thorough job description for a senior platform engineering position with NestJS.';

    beforeAll(async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      bearer = login.body.accessToken as string;
      const cookies = (login.headers['set-cookie'] as unknown as string[]) ?? [];
      cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      const r = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'SSE Target', jsonResume: { basics: { name: 'Ada' } } })
        .expect(201);
      resumeId = r.body.id as string;
    });

    it('live analysis stream: snapshot -> transitions -> terminal close; exact headers', async () => {
      const created = await http()
        .post('/api/v1/analyses')
        .set(auth())
        .send({ name: 'SSE journey', jobDescription: JD, resumeId })
        .expect(201);
      const capture = await consumeSse(
        server(),
        `/api/v1/analyses/${created.body.id}/events`,
        cookie,
        { maxMs: 20_000, until: () => false }, // run to server-side close
      );
      expect(capture.status).toBe(200);
      expect(capture.headers['content-type']).toContain('text/event-stream');
      expect(capture.headers['cache-control']).toBe('no-cache');
      expect(capture.headers['x-accel-buffering']).toBe('no');
      expect(capture.closedByServer).toBe(true); // closes itself after terminal
      expect(capture.events[0]!.event).toBe('snapshot');
      const last = capture.events.at(-1)!;
      expect(last.event).toMatch(/snapshot|status/);
      expect((last.data as { status: string }).status).toBe('completed');
      // polling fallback returns the structurally identical DTO (#50 contract)
      const polled = await http()
        .get(`/api/v1/analyses/${created.body.id}`)
        .set(auth())
        .expect(200);
      expect(Object.keys(polled.body).sort()).toEqual(
        Object.keys(last.data as Record<string, unknown>).sort(),
      );
    });

    it('reconnect after completion: snapshot carries terminal state, then immediate close', async () => {
      const list = await http()
        .get(`/api/v1/analyses?status=completed&limit=1`)
        .set(auth())
        .expect(200);
      const done = (list.body.items as Array<{ id: string }>)[0]!.id;
      const capture = await consumeSse(server(), `/api/v1/analyses/${done}/events`, cookie, {
        maxMs: 5000,
      });
      expect(capture.closedByServer).toBe(true);
      expect(capture.events).toHaveLength(1);
      expect((capture.events[0]!.data as { status: string }).status).toBe('completed');
    });

    it('heartbeats arrive on an idle bell stream; cap yields 429; auth/ownership enforced', async () => {
      const idle = await consumeSse(server(), '/api/v1/notifications/events', cookie, {
        maxMs: 700,
      });
      expect(idle.events[0]!.event).toBe('snapshot');
      expect(idle.comments.some((c) => c.includes('ping'))).toBe(true); // 200ms cadence in e2e
      // polling-fallback contract (#50): SSE bell payload == GET /notifications DTO
      const polledBell = await http().get('/api/v1/notifications').set(auth()).expect(200);
      expect(Object.keys(polledBell.body).sort()).toEqual(
        Object.keys(idle.events[0]!.data as Record<string, unknown>).sort(),
      );

      const holdA = consumeSse(server(), '/api/v1/notifications/events', cookie, { maxMs: 2500 });
      const holdB = consumeSse(server(), '/api/v1/notifications/events', cookie, { maxMs: 2500 });
      await new Promise((r) => setTimeout(r, 300)); // both established (cap=2 in e2e env)
      const third = await consumeSse(server(), '/api/v1/notifications/events', cookie, {
        maxMs: 2000,
      });
      expect(third.status).toBe(429);
      await Promise.all([holdA, holdB]);

      const unauth = await consumeSse(server(), '/api/v1/notifications/events', '', {
        maxMs: 1500,
      });
      expect(unauth.status).toBe(401);
      const foreign = await consumeSse(
        server(),
        `/api/v1/analyses/${'0'.repeat(24)}/events`,
        cookie,
        {
          maxMs: 1500,
        },
      );
      expect(foreign.status).toBe(404);
    });
  });

  describe('admin stats (issue #52 / 6.1)', () => {
    const adminCreds = { email: 'boss@e2e.test', fullName: 'Boss', password: 'Engine-9511X' };
    let adminBearer = '';
    const adminAuth = () => ({ Authorization: `Bearer ${adminBearer}` });

    beforeAll(async () => {
      await http().post('/api/v1/auth/register').send(adminCreds).expect(201);
      // promote directly (registration only creates candidates)
      await mongoose.connection
        .db!.collection('users')
        .updateOne({ email: adminCreds.email }, { $set: { role: 'admin' } });
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: adminCreds.email, password: adminCreds.password })
        .expect(200);
      adminBearer = login.body.accessToken as string;
    });

    it('role matrix: anonymous 401, candidate 403, admin 200 with sane totals', async () => {
      await http().get('/api/v1/admin/stats').expect(401);
      const cand = { email: 'pleb@e2e.test', fullName: 'Pleb', password: 'Engine-9512X' };
      await http().post('/api/v1/auth/register').send(cand).expect(201);
      const l = await http()
        .post('/api/v1/auth/login')
        .send({ email: cand.email, password: cand.password })
        .expect(200);
      await http()
        .get('/api/v1/admin/stats')
        .set({ Authorization: `Bearer ${l.body.accessToken}` })
        .expect(403);

      const before = await http().get('/api/v1/admin/stats').set(adminAuth()).expect(200);
      expect(before.body.users).toBeGreaterThan(5); // everything this suite created
      expect(before.body.analyses).toBeGreaterThan(3);
      expect(typeof before.body.generatedAt).toBe('string');
      // soft-deleted resumes are excluded: live count only
      const liveResumes = await mongoose.connection
        .db!.collection('resumes')
        .countDocuments({ deletedAt: null });
      expect(before.body.resumes).toBe(liveResumes);
    });

    it('stays under 200ms with a 10k-doc fixture (cache cold)', async () => {
      const db = mongoose.connection.db!;
      const filler = Array.from({ length: 10_000 }, (_, i) => ({
        userId: new mongoose.Types.ObjectId(),
        name: `bench-${i}`,
        source: 'created',
        jsonResume: { basics: { name: 'B' } },
        deletedAt: null,
        schemaVersion: 1,
      }));
      await db.collection('resumes').insertMany(filler);
      await new Promise((r) => setTimeout(r, 1100)); // past the 1s e2e cache window -> cold read
      const t = Date.now();
      await http().get('/api/v1/admin/stats').set(adminAuth()).expect(200);
      const elapsed = Date.now() - t;
      expect(elapsed).toBeLessThan(750); // 200ms target; CI variance headroom
      await db.collection('resumes').deleteMany({ name: /^bench-/ });
    });

    it('user management journey: search, patch, deactivate kills access, reset modes (#53)', async () => {
      const victim = { email: 'victim@e2e.test', fullName: 'Vic Tim', password: 'Engine-9613X' };
      await http().post('/api/v1/auth/register').send(victim).expect(201);
      const vLogin = await http()
        .post('/api/v1/auth/login')
        .send({ email: victim.email, password: victim.password })
        .expect(200);
      const vBearer = vLogin.body.accessToken as string;

      // search by email prefix, name prefix, then exact id
      const byEmail = await http()
        .get('/api/v1/admin/users?search=victim@')
        .set(adminAuth())
        .expect(200);
      expect(byEmail.body.total).toBe(1);
      const row = byEmail.body.items[0] as { id: string; fullName: string };
      const byName = await http()
        .get('/api/v1/admin/users?search=Vic')
        .set(adminAuth())
        .expect(200);
      expect((byName.body.items as Array<{ id: string }>).some((u) => u.id === row.id)).toBe(true);
      const byId = await http()
        .get(`/api/v1/admin/users?search=${row.id}`)
        .set(adminAuth())
        .expect(200);
      expect(byId.body.total).toBe(1);

      // patch: name ok; email collision 409
      await http()
        .patch(`/api/v1/admin/users/${row.id}`)
        .set(adminAuth())
        .send({ fullName: 'Vic T. Renamed' })
        .expect(200);
      await http()
        .patch(`/api/v1/admin/users/${row.id}`)
        .set(adminAuth())
        .send({ email: 'boss@e2e.test' })
        .expect(409);

      // deactivate: existing bearer dies on next request, refresh revoked
      await http().post(`/api/v1/admin/users/${row.id}/deactivate`).set(adminAuth()).expect(201);
      await http()
        .get('/api/v1/users/me')
        .set({ Authorization: `Bearer ${vBearer}` })
        .expect(403);
      const vCookies = ((vLogin.headers['set-cookie'] as unknown as string[]) ?? [])
        .map((c) => c.split(';')[0])
        .join('; ');
      await http().post('/api/v1/auth/refresh').set('Cookie', vCookies).expect(401);

      // self-deactivation blocked
      const meId = (await http().get('/api/v1/users/me').set(adminAuth()).expect(200)).body
        .id as string;
      await http().post(`/api/v1/admin/users/${meId}/deactivate`).set(adminAuth()).expect(409);

      // reactivate + temporary reset -> login with temp password works
      await http().post(`/api/v1/admin/users/${row.id}/reactivate`).set(adminAuth()).expect(201);
      const reset = await http()
        .post(`/api/v1/admin/users/${row.id}/reset-password`)
        .set(adminAuth())
        .send({ mode: 'temporary' })
        .expect(201);
      const temp = reset.body.temporaryPassword as string;
      expect(temp.length).toBeGreaterThanOrEqual(12);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: victim.email, password: temp })
        .expect(200);

      // email-mode reset lands in the console inbox
      const inbox = app.get<MailService>(MailService).driver as unknown as ConsoleMailDriver;
      const before = inbox.sent.length;
      await http()
        .post(`/api/v1/admin/users/${row.id}/reset-password`)
        .set(adminAuth())
        .send({ mode: 'email' })
        .expect(201);
      expect(inbox.sent.length).toBe(before + 1);

      // audit rows for every mutation
      const audits = await mongoose.connection
        .db!.collection('auditlogs')
        .find({ 'meta.mode': { $exists: true } })
        .toArray();
      expect(audits.length).toBeGreaterThanOrEqual(2);
      const actions = await mongoose.connection.db!.collection('auditlogs').distinct('action');
      for (const expected of [
        'admin.user.update',
        'admin.user.deactivate',
        'admin.user.password_reset',
      ]) {
        expect(actions).toContain(expected);
      }
    });

    it('resume oversight: metadata-only listing, content denial, cascade delete (#54)', async () => {
      // the analyst user from the analysis suite has resumes + analyses + bell rows
      const target = await mongoose.connection
        .db!.collection('users')
        .findOne({ email: 'analyst@e2e.test' });
      const targetId = String(target!._id);

      const listing = await http()
        .get(`/api/v1/admin/users/${targetId}/resumes`)
        .set(adminAuth())
        .expect(200);
      expect(listing.body.total).toBeGreaterThan(0);
      for (const row of listing.body.items as Array<Record<string, unknown>>) {
        expect(Object.keys(row).sort()).toEqual(
          ['analysisCount', 'analysisStatus', 'createdAt', 'id', 'name', 'source'].sort(),
        );
        expect(JSON.stringify(row)).not.toMatch(/jsonResume|originalText|overallScore/);
      }

      // structural denial: admin hitting candidate content routes for foreign data
      const someResume = (listing.body.items as Array<{ id: string }>)[0]!.id;
      await http().get(`/api/v1/resumes/${someResume}`).set(adminAuth()).expect(404);

      // cascade: pick a resume with analyses
      const resumeDoc = await mongoose.connection
        .db!.collection('resumes')
        .findOne({ userId: target!._id, analysisCount: { $gt: 0 }, deletedAt: null });
      const victimResume = String(resumeDoc!._id);
      const ownerBefore = await mongoose.connection
        .db!.collection('users')
        .findOne({ _id: target!._id });

      const cascade = await http()
        .delete(`/api/v1/admin/resumes/${victimResume}`)
        .set(adminAuth())
        .expect(200);
      expect(cascade.body.resumeDeleted).toBe(true);
      expect(cascade.body.analysesDeleted).toBeGreaterThan(0);

      // analyses soft-deleted + hidden from the candidate API
      const liveAnalyses = await mongoose.connection
        .db!.collection('analyses')
        .countDocuments({ resumeId: resumeDoc!._id, deletedAt: null });
      expect(liveAnalyses).toBe(0);
      // counters corrected
      const ownerAfter = await mongoose.connection
        .db!.collection('users')
        .findOne({ _id: target!._id });
      expect(ownerAfter!.resumeCount).toBe((ownerBefore!.resumeCount as number) - 1);
      expect(ownerAfter!.analysisCount).toBe(
        (ownerBefore!.analysisCount as number) - (cascade.body.analysesDeleted as number),
      );

      // idempotent re-run: nothing double-decrements
      const rerun = await http()
        .delete(`/api/v1/admin/resumes/${victimResume}`)
        .set(adminAuth())
        .expect(200);
      expect(rerun.body).toEqual({
        resumeDeleted: false,
        analysesDeleted: 0,
        notificationsCleared: 0,
      });
      const ownerFinal = await mongoose.connection
        .db!.collection('users')
        .findOne({ _id: target!._id });
      expect(ownerFinal!.resumeCount).toBe(ownerAfter!.resumeCount);

      // audit row: ids + counts only
      const audit = await mongoose.connection
        .db!.collection('auditlogs')
        .findOne({ action: 'admin.resume.delete' });
      expect(audit).toBeTruthy();
      expect(JSON.stringify(audit!.meta)).not.toMatch(/jsonResume|originalText|basics/);
    });

    it('model management: validate-first add, masked everywhere, rotate, guard, denial (#55)', async () => {
      // candidate denial matrix
      const candLogin = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'pleb@e2e.test', password: 'Engine-9512X' })
        .expect(200);
      const candAuth = { Authorization: `Bearer ${candLogin.body.accessToken}` };
      await http().get('/api/v1/admin/models').set(candAuth).expect(403);
      await http().post('/api/v1/admin/models').set(candAuth).send({}).expect(403);

      // invalid key -> 422, nothing persisted
      await http()
        .post('/api/v1/admin/models')
        .set(adminAuth())
        .send({
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: 'sk-!!BAD_KEY!!-0000',
          usages: ['analysis'],
        })
        .expect(422);
      const empty = await http().get('/api/v1/admin/models').set(adminAuth()).expect(200);
      expect(empty.body).toHaveLength(0);

      // valid add -> masked response + masked list; raw key nowhere
      const created = await http()
        .post('/api/v1/admin/models')
        .set(adminAuth())
        .send({
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: 'sk-live-e2e-key-3kF9',
          usages: ['analysis', 'fallback'],
        })
        .expect(201);
      expect(created.body.apiKeyMasked).toBe('••••3kF9');
      expect(JSON.stringify(created.body)).not.toContain('sk-live-e2e-key');
      const modelId = created.body.id as string;

      // duplicate -> 409
      await http()
        .post('/api/v1/admin/models')
        .set(adminAuth())
        .send({
          provider: 'openai',
          modelName: 'GPT-4O',
          apiKey: 'sk-live-other-1111',
          usages: ['analysis'],
        })
        .expect(409);

      // rotate -> new mask; raw keys never serialized; mongo stores ciphertext only
      const rotated = await http()
        .post(`/api/v1/admin/models/${modelId}/rotate-key`)
        .set(adminAuth())
        .send({ apiKey: 'sk-live-rotated-ZZ77' })
        .expect(201);
      expect(rotated.body.apiKeyMasked).toBe('••••ZZ77');
      const stored = await mongoose.connection
        .db!.collection('aimodels')
        .findOne({ _id: new mongoose.Types.ObjectId(modelId) });
      expect(String(stored!.apiKeyEncrypted)).not.toContain('sk-live-rotated');
      expect(String(stored!.apiKeyEncrypted).split('.')).toHaveLength(3); // iv.tag.data

      // delete guard: only active model, no env fallback -> 409 listing usages
      const guard = await http()
        .delete(`/api/v1/admin/models/${modelId}`)
        .set(adminAuth())
        .expect(409);
      expect(guard.body.details.orphanedUsages).toContain('analysis');
      // disable, then delete is fine
      await http()
        .patch(`/api/v1/admin/models/${modelId}`)
        .set(adminAuth())
        .send({ status: 'disabled' })
        .expect(200);
      await http().delete(`/api/v1/admin/models/${modelId}`).set(adminAuth()).expect(204);

      // audits exist, none carry a raw key
      const modelAudits = await mongoose.connection
        .db!.collection('auditlogs')
        .find({
          action: { $in: ['admin.model.add', 'admin.model.remove', 'admin.model.key_rotate'] },
        })
        .toArray();
      expect(modelAudits.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(modelAudits)).not.toMatch(/sk-live/);
    });

    it('RBAC matrix from route introspection: every admin route denies non-admins (#56)', async () => {
      type Layer = {
        route?: { path: string; methods: Record<string, boolean> };
        name: string;
        handle?: { stack: Layer[] };
        regexp?: RegExp;
      };
      const expressApp = app.getHttpServer().listeners('request')[0] as unknown as {
        router: { stack: Layer[] };
      };
      const collect = (stack: Layer[], prefix = ''): Array<{ method: string; path: string }> => {
        const out: Array<{ method: string; path: string }> = [];
        for (const layer of stack) {
          if (layer.route) {
            for (const m of Object.keys(layer.route.methods)) {
              out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
            }
          } else if (layer.name === 'router' && layer.handle) {
            out.push(...collect(layer.handle.stack, prefix));
          }
        }
        return out;
      };
      const adminRoutes = collect(expressApp.router.stack).filter((r) =>
        r.path.startsWith('/api/v1/admin'),
      );
      expect(adminRoutes.length).toBeGreaterThanOrEqual(11); // grows automatically with new routes

      // deactivated admin persona
      const exAdmin = { email: 'ex-admin@e2e.test', fullName: 'Ex', password: 'Engine-9777X' };
      await http().post('/api/v1/auth/register').send(exAdmin).expect(201);
      await mongoose.connection
        .db!.collection('users')
        .updateOne({ email: exAdmin.email }, { $set: { role: 'admin' } });
      const exLogin = await http()
        .post('/api/v1/auth/login')
        .send({ email: exAdmin.email, password: exAdmin.password })
        .expect(200);
      const exBearer = exLogin.body.accessToken as string;
      await mongoose.connection
        .db!.collection('users')
        .updateOne({ email: exAdmin.email }, { $set: { status: 'deactivated' } });

      const candLogin = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'pleb@e2e.test', password: 'Engine-9512X' })
        .expect(200);

      const personas: Array<{ name: string; headers: Record<string, string>; expected: number }> = [
        { name: 'anonymous', headers: {}, expected: 401 },
        {
          name: 'candidate',
          headers: { Authorization: `Bearer ${candLogin.body.accessToken}` },
          expected: 403,
        },
        {
          name: 'deactivated-admin',
          headers: { Authorization: `Bearer ${exBearer}` },
          expected: 403,
        },
      ];

      const failures: string[] = [];
      for (const route of adminRoutes) {
        const concrete = route.path.replace(/:[A-Za-z]+/g, '0'.repeat(24));
        for (const persona of personas) {
          const agent = request(app.getHttpServer() as App);
          const verb = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
          if (typeof agent[verb] !== 'function') continue;
          const res = await agent[verb](concrete).set(persona.headers).send({});
          if (res.status !== persona.expected) {
            failures.push(`${persona.name} ${route.method} ${concrete} -> ${res.status}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  });

  describe('phase-3 hardening sweep (issue #37 / 3.7)', () => {
    const creds = { email: 'sweep@e2e.test', fullName: 'Sweep', password: 'Engine-9911X' };
    const foe = { email: 'sweep-foe@e2e.test', fullName: 'Foe', password: 'Engine-9912X' };
    let bearer = '';
    let foeBearer = '';
    const auth = (token = bearer) => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
      for (const u of [creds, foe]) {
        await http().post('/api/v1/auth/register').send(u).expect(201);
      }
      const a = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      bearer = a.body.accessToken as string;
      const b = await http()
        .post('/api/v1/auth/login')
        .send({ email: foe.email, password: foe.password })
        .expect(200);
      foeBearer = b.body.accessToken as string;
    });

    it('401 matrix: every resume route requires auth (uniform envelope)', async () => {
      const id = '0'.repeat(24);
      const attempts = [
        http().get('/api/v1/resumes'),
        http().post('/api/v1/resumes').send({ name: 'X', jsonResume: {} }),
        http().get(`/api/v1/resumes/${id}`),
        http().patch(`/api/v1/resumes/${id}`).send({ name: 'Y' }),
        http().delete(`/api/v1/resumes/${id}`),
        http().post('/api/v1/resumes/upload'),
        http().get('/api/v1/users/me/stats'),
      ];
      for (const req of attempts) {
        const res = await req.expect(401);
        expect(res.body.error).toBe('Unauthorized');
        expect(res.body.requestId).toBeDefined();
      }
    });

    it('malformed ObjectId params are 400, not 500', async () => {
      for (const bad of ['not-an-id', '123', '0'.repeat(23) + 'g']) {
        const res = await http().get(`/api/v1/resumes/${bad}`).set(auth()).expect(400);
        expect(res.body.message).toMatch(/identifier/i);
      }
    });

    it('IDOR matrix completion: foreign PATCH is an existence-hiding 404', async () => {
      const mine = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Sweep Private', jsonResume: { basics: { name: 'S' } } })
        .expect(201);
      await http()
        .patch(`/api/v1/resumes/${mine.body.id}`)
        .set(auth(foeBearer))
        .send({ name: 'Hijacked', version: 1 })
        .expect(404);
      // and the owner still sees the original, untouched
      const check = await http().get(`/api/v1/resumes/${mine.body.id}`).set(auth()).expect(200);
      expect(check.body.name).toBe('Sweep Private');
    });

    it('name uniqueness: duplicate create and rename-collision are 409 (case-insensitive)', async () => {
      await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Taken Name', jsonResume: {} })
        .expect(201);
      const dup = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'TAKEN NAME', jsonResume: {} })
        .expect(409);
      expect(dup.body.error).toBe('Conflict');
      const second = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Different', jsonResume: {} })
        .expect(201);
      await http()
        .patch(`/api/v1/resumes/${second.body.id}`)
        .set(auth())
        .send({ name: 'taken name', version: 1 })
        .expect(409);
    });

    it('pagination edges: out-of-range params are 400; far page is empty with true total', async () => {
      await http().get('/api/v1/resumes?page=0').set(auth()).expect(400);
      await http().get('/api/v1/resumes?limit=101').set(auth()).expect(400);
      await http().get('/api/v1/resumes?limit=-1').set(auth()).expect(400);
      const far = await http().get('/api/v1/resumes?page=99&limit=20').set(auth()).expect(200);
      expect(far.body.items).toEqual([]);
      expect(typeof far.body.total).toBe('number');
      expect(far.body.total).toBeGreaterThan(0);
    });

    it('soft-deleted resumes stay dead: GET and PATCH both 404 after delete', async () => {
      const r = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Ephemeral', jsonResume: {} })
        .expect(201);
      await http().delete(`/api/v1/resumes/${r.body.id}`).set(auth()).expect(204);
      await http().get(`/api/v1/resumes/${r.body.id}`).set(auth()).expect(404);
      await http()
        .patch(`/api/v1/resumes/${r.body.id}`)
        .set(auth())
        .send({ name: 'Zombie', version: 1 })
        .expect(404);
    });
  });

  it('GET /api/v1/health/ready → 200 with mongo up', async () => {
    const res = await http().get('/api/v1/health/ready').expect(200);
    expect(res.body.details.mongodb.status).toBe('up');
  });

  it('unknown /api route → JSON 404 envelope', async () => {
    const res = await http().get('/api/v1/definitely-not-a-route').expect(404);
    expect(res.body.statusCode).toBe(404);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.path).toBe('/api/v1/definitely-not-a-route');
  });

  describe('auth: register + login (issue #22 / 2.1)', () => {
    const creds = { email: 'ada@e2e.test', fullName: 'Ada Lovelace', password: 'Engine-4242X' };

    it('registers, never leaking the hash, and audits', async () => {
      const res = await http().post('/api/v1/auth/register').send(creds).expect(201);
      expect(res.body.email).toBe(creds.email);
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
      const audits = await mongoose.connection
        .db!.collection('auditlogs')
        .countDocuments({ action: 'user.register' });
      expect(audits).toBe(1);
    });

    it('duplicate email (case-insensitive) → 409 envelope', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ ...creds, email: 'ADA@E2E.TEST' })
        .expect(409);
      expect(res.body.error).toBe('Conflict');
    });

    it('weak password → 422 with field detail', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'weak@e2e.test', fullName: 'W', password: 'short' })
        .expect(422);
      expect(JSON.stringify(res.body.details)).toContain('password');
    });

    it('login flows: 200 valid, 401 wrong password, 401 unknown email', async () => {
      const ok = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      expect(ok.body.email).toBe(creds.email);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: 'Wrong-12345' })
        .expect(401);
      const ghost = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@e2e.test', password: 'Wrong-12345' })
        .expect(401);
      expect(wrong.body.message).toBe(ghost.body.message);
    });

    it('deactivated account → explicit 403', async () => {
      await mongoose.connection
        .db!.collection('users')
        .updateOne({ email: creds.email }, { $set: { status: 'deactivated' } });
      await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(403);
      await mongoose.connection
        .db!.collection('users')
        .updateOne({ email: creds.email }, { $set: { status: 'active' } });
    });
  });

  describe('auth: session tokens (issue #23 / 2.2)', () => {
    const creds = { email: 'rot@e2e.test', fullName: 'Rotator', password: 'Engine-4242X' };
    const getCookies = (res: { headers: Record<string, unknown> }): string[] =>
      ([] as string[]).concat((res.headers['set-cookie'] as unknown as string[]) ?? []);
    const cookieHeader = (cookies: string[]): string =>
      cookies.map((c) => c.split(';')[0]).join('; ');

    it('login sets httpOnly access+refresh cookies and returns a bearer token', async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      const cookies = getCookies(res);
      expect(cookies.some((c) => c.startsWith('cvantage.access=') && /HttpOnly/i.test(c))).toBe(
        true,
      );
      expect(
        cookies.some(
          (c) =>
            c.startsWith('cvantage.refresh=') && /HttpOnly/i.test(c) && c.includes('/api/v1/auth'),
        ),
      ).toBe(true);
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('refresh rotates; the old token is dead; replay revokes the family', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      const c1 = cookieHeader(getCookies(login));

      const r1 = await http().post('/api/v1/auth/refresh').set('Cookie', c1).send({}).expect(200);
      const c2 = cookieHeader(getCookies(r1));
      expect(c2).not.toBe(c1);

      // replaying the consumed token → 401 + family revocation
      await http().post('/api/v1/auth/refresh').set('Cookie', c1).send({}).expect(401);
      // even the newer token is now revoked (family containment)
      await http().post('/api/v1/auth/refresh').set('Cookie', c2).send({}).expect(401);
      const audits = await mongoose.connection
        .db!.collection('auditlogs')
        .countDocuments({ action: 'auth.refresh_reuse' });
      expect(audits).toBeGreaterThanOrEqual(1);
    });

    it('logout clears cookies and kills the refresh token', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      const c = cookieHeader(getCookies(login));
      const out = await http().post('/api/v1/auth/logout').set('Cookie', c).send({}).expect(204);
      expect(getCookies(out).every((x) => /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(x))).toBe(
        true,
      );
      await http().post('/api/v1/auth/refresh').set('Cookie', c).send({}).expect(401);
    });
  });

  describe('auth: verification + password reset (issue #26 / 2.5)', () => {
    const creds = { email: 'mailer@e2e.test', fullName: 'Mailer', password: 'Engine-4242X' };
    const inbox = (): { to: string; text: string }[] =>
      (app.get(MailService).driver as ConsoleMailDriver).sent;
    const tokenFrom = (text: string, kind: string): string =>
      new RegExp(kind + '[?]token=([A-Za-z0-9_-]+)').exec(text)![1]!;

    it('register sends a verification mail; verify flips the flag; token is single-use', async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const mail = inbox().find((m) => m.to === creds.email)!;
      expect(mail).toBeDefined();
      const token = tokenFrom(mail.text, 'verify-email');
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
      const user = await mongoose.connection
        .db!.collection('users')
        .findOne({ email: creds.email });
      expect(user!.emailVerified).toBe(true);
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    });

    it('forgot-password is uniform 202; reset rotates the hash and revokes sessions', async () => {
      const ghost = await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@e2e.test' })
        .expect(202);
      const real = await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: creds.email })
        .expect(202);
      expect(ghost.body).toEqual(real.body);

      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      const cookies = ([] as string[]).concat(
        (login.headers['set-cookie'] as unknown as string[]) ?? [],
      );
      const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

      const mail = inbox()
        .filter((m) => m.to === creds.email)
        .pop()!;
      const token = tokenFrom(mail.text, 'reset-password');
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Fresh-Engine-77' })
        .expect(200);

      await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: 'Fresh-Engine-77' })
        .expect(200);
      // all pre-reset refresh sessions are revoked
      await http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader).send({}).expect(401);
      const audits = await mongoose.connection
        .db!.collection('auditlogs')
        .countDocuments({ action: 'user.password_reset' });
      expect(audits).toBe(1);
    });
  });

  describe('users self-service (issue #27 / 2.6)', () => {
    const creds = { email: 'self@e2e.test', fullName: 'Selfie', password: 'Engine-4242X' };
    const session = async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      const cookies = ([] as string[]).concat(
        (res.headers['set-cookie'] as unknown as string[]) ?? [],
      );
      return {
        bearer: res.body.accessToken as string,
        cookieHeader: cookies.map((c) => c.split(';')[0]).join('; '),
      };
    };

    it('GET/PATCH /users/me round-trips profile changes (auth required)', async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      await http().get('/api/v1/users/me').expect(401);
      const { bearer } = await session();
      const me = await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
      expect(me.body).toMatchObject({ email: creds.email, providers: [], resumeCount: 0 });
      const patched = await http()
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ fullName: 'Self Improved' })
        .expect(200);
      expect(patched.body.fullName).toBe('Self Improved');
    });

    it('password change keeps the current session and revokes the other', async () => {
      const a = await session();
      const b = await session();
      const res = await http()
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${a.bearer}`)
        .set('Cookie', a.cookieHeader)
        .send({ currentPassword: creds.password, newPassword: 'Twice-Engine-88' })
        .expect(200);
      expect(res.body.revokedSessions).toBeGreaterThanOrEqual(1);
      await http().post('/api/v1/auth/refresh').set('Cookie', a.cookieHeader).send({}).expect(200);
      await http().post('/api/v1/auth/refresh').set('Cookie', b.cookieHeader).send({}).expect(401);
      creds.password = 'Twice-Engine-88';
      await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
    });

    it('wrong current password → 403; oauth-only guidance is a 409 (unit-covered)', async () => {
      const { bearer } = await session();
      await http()
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ currentPassword: 'Nope-12345X', newPassword: 'Other-Engine-99' })
        .expect(403);
    });
  });

  describe('auth lockout (issue #28 / 2.7)', () => {
    it('repeated failures lock the account — even the correct password 429s', async () => {
      const creds = { email: 'locked@e2e.test', fullName: 'Locky', password: 'Engine-4242X' };
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ email: creds.email, password: 'Wrong-12345' })
          .expect(401);
      }
      const blocked = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(blocked.body.details.retryAfterS).toBeGreaterThan(0);
      const audits = await mongoose.connection
        .db!.collection('auditlogs')
        .countDocuments({ action: 'auth.lockout' });
      expect(audits).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resume crud (issue #32 / 3.2)', () => {
    const creds = { email: 'crud@e2e.test', fullName: 'Crud', password: 'Engine-4242X' };
    let bearer = '';
    const auth = () => ({ Authorization: `Bearer ${bearer}` });

    beforeAll(async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      bearer = login.body.accessToken as string;
    });

    it('full journey: create → list → get → patch (OCC) → delete frees the name', async () => {
      const created = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({
          name: 'My Resume',
          jsonResume: { basics: { name: 'Ada', summary: '  ' }, skills: [] },
        })
        .expect(201);
      const id = created.body.id as string;
      // placeholder pruning end-to-end
      expect(created.body.jsonResume).toEqual({ basics: { name: 'Ada' } });
      const stored = await mongoose.connection
        .db!.collection('resumes')
        .findOne({ name: 'My Resume' });
      expect(stored!.jsonResume).toEqual({ basics: { name: 'Ada' } });

      // duplicate live name (case-insensitive) → 409
      await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'my resume', jsonResume: {} })
        .expect(409);

      const list = await http().get('/api/v1/resumes?limit=10').set(auth()).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).not.toHaveProperty('jsonResume');

      const got = await http().get(`/api/v1/resumes/${id}`).set(auth()).expect(200);
      const v = got.body.version as number;

      const patched = await http()
        .patch(`/api/v1/resumes/${id}`)
        .set(auth())
        .send({ name: 'Renamed', version: v })
        .expect(200);
      expect(patched.body.version).toBe(v + 1);

      // stale version → 409 with currentVersion
      const conflict = await http()
        .patch(`/api/v1/resumes/${id}`)
        .set(auth())
        .send({ name: 'Loser', version: v })
        .expect(409);
      expect(conflict.body.details.currentVersion).toBe(v + 1);

      await http().delete(`/api/v1/resumes/${id}`).set(auth()).expect(204);
      await http().get(`/api/v1/resumes/${id}`).set(auth()).expect(404);
      // soft delete frees the name
      await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'My Resume', jsonResume: {} })
        .expect(201);
    });

    it('stats reflect crud churn (issue #33 / 3.3)', async () => {
      const stats = await http().get('/api/v1/users/me/stats').set(auth()).expect(200);
      // journey above: created 2 live resumes (one was deleted) at this point
      expect(stats.body.resumeCount).toBe(2);
      expect(stats.body.analysisCount).toBe(0);
    });

    it('ownership: a second user gets 404 on foreign ids (no existence leak)', async () => {
      const mine = await http()
        .post('/api/v1/resumes')
        .set(auth())
        .send({ name: 'Private', jsonResume: {} })
        .expect(201);
      const other = { email: 'crud2@e2e.test', fullName: 'Other', password: 'Engine-4242X' };
      await http().post('/api/v1/auth/register').send(other).expect(201);
      const login2 = await http()
        .post('/api/v1/auth/login')
        .send({ email: other.email, password: other.password })
        .expect(200);
      const b2 = login2.body.accessToken as string;
      await http()
        .get(`/api/v1/resumes/${mine.body.id}`)
        .set({ Authorization: `Bearer ${b2}` })
        .expect(404);
      await http()
        .delete(`/api/v1/resumes/${mine.body.id}`)
        .set({ Authorization: `Bearer ${b2}` })
        .expect(404);
    });
  });

  describe('resume upload (issue #35 / 3.5)', () => {
    const creds = { email: 'upload@e2e.test', fullName: 'Upper', password: 'Engine-4242X' };
    let bearer = '';
    const auth = () => ({ Authorization: `Bearer ${bearer}` });
    const PDF: Buffer = Buffer.alloc(0);
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    beforeAll(async () => {
      await http().post('/api/v1/auth/register').send(creds).expect(201);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
      bearer = login.body.accessToken as string;
    });

    it('happy path: pdf upload creates an uploaded resume with pending parse', async () => {
      const res = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', PDF, { filename: 'Ada Lovelace CV.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(res.body).toMatchObject({
        source: 'uploaded',
        name: 'Ada Lovelace CV',
        uploadParse: { status: 'pending' },
      });
      const row = await mongoose.connection
        .db!.collection('resumes')
        .findOne({ _id: new mongoose.Types.ObjectId(res.body.id as string) });
      expect(row!.originalFile.sizeBytes).toBe(PDF.length);
      expect(row!.originalFile.storageKey).toMatch(/.pdf$/);
      expect(row!.originalFile.sha256).toHaveLength(64);
      // extraction ran inline (issue #36 / 3.6)
      expect(String(row!.originalText)).toContain('Senior Engineer');
      expect(res.body.originalText).toContain('TypeScript');
    });

    it('same filename dedupes to "… (2)"', async () => {
      const res = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', PDF, { filename: 'Ada Lovelace CV.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(res.body.name).toBe('Ada Lovelace CV (2)');
    });

    it('spoofed exe renamed to .pdf → 422 naming the magic-byte mismatch', async () => {
      const res = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', Buffer.from('MZbinary'), {
          filename: 'evil.pdf',
          contentType: 'application/pdf',
        })
        .expect(422);
      expect(JSON.stringify(res.body.details)).toContain('sniffed');
    });

    it('parseable container with corrupt content -> uploadParse failed with a typed reason', async () => {
      const corrupt = Buffer.from('%PDF-1.4 but nothing real follows');
      const res = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', corrupt, { filename: 'broken.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(res.body.uploadParse.status).toBe('failed');
      expect(String(res.body.uploadParse.error)).toMatch(/CORRUPT_FILE|EMPTY_TEXT/);
    });

    it('background parse: fake LLM fills jsonResume and flips status to completed', async () => {
      const up = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', PDF, { filename: 'parse-me.pdf', contentType: 'application/pdf' })
        .expect(201);
      const id = up.body.id as string;
      let detail: Record<string, never> | undefined;
      for (let i = 0; i < 30; i += 1) {
        const res = await http().get(`/api/v1/resumes/${id}`).set(auth()).expect(200);
        if (res.body.uploadParse.status === 'completed') {
          detail = res.body as Record<string, never>;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(detail).toBeDefined();
      const body = detail as unknown as {
        jsonResume: { basics: { name: string }; work: unknown[] };
        uploadParse: { modelUsed: string };
      };
      expect(body.jsonResume.basics.name).toBe('Ada Lovelace'); // fixture, post-prune
      expect(body.jsonResume.work).toHaveLength(1);
      expect(body.uploadParse.modelUsed).toBe('fake/fake-fixture');
    });

    it('reparse: only failed parses; owner only; 202 then terminal again', async () => {
      // corrupt upload -> extraction failed (deterministic, no originalText)
      const bad = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', Buffer.from('%PDF-1.4 garbage'), {
          filename: 'will-fail.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const badId = bad.body.id as string;
      expect(bad.body.uploadParse.status).toBe('failed');

      const re = await http().post(`/api/v1/resumes/${badId}/reparse`).set(auth()).expect(202);
      expect(re.body.uploadParse.status).toBe('pending');

      // no extracted text -> pipeline fails it terminally again with a clear reason
      let finalStatus = '';
      for (let i = 0; i < 30; i += 1) {
        const res = await http().get(`/api/v1/resumes/${badId}`).set(auth()).expect(200);
        finalStatus = res.body.uploadParse.status as string;
        if (finalStatus === 'failed') {
          expect(String(res.body.uploadParse.error)).toMatch(/No extracted text/);
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(finalStatus).toBe('failed');

      // reparse from a non-failed state is a 409
      const ok = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', PDF, { filename: 'fine.pdf', contentType: 'application/pdf' })
        .expect(201);
      for (let i = 0; i < 30; i += 1) {
        const res = await http().get(`/api/v1/resumes/${ok.body.id}`).set(auth()).expect(200);
        if (res.body.uploadParse.status === 'completed') break;
        await new Promise((r) => setTimeout(r, 500));
      }
      await http().post(`/api/v1/resumes/${ok.body.id}/reparse`).set(auth()).expect(409);
    });

    it('declared-mime mismatch and oversize are rejected (422 / 413)', async () => {
      await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', PDF, { filename: 'cv.pdf', contentType: DOCX_MIME })
        .expect(422);
      const big = Buffer.concat([
        Buffer.from('%PDF-1.4'),
        Buffer.alloc(10 * 1024 * 1024 + 10, 0x20),
      ]);
      const res = await http()
        .post('/api/v1/resumes/upload')
        .set(auth())
        .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' })
        .expect(413);
      expect(res.body.message).toMatch(/10MB/);
    });
  });

  it('GET /api/v1/health/ready → 503 once mongo stops (readiness flip)', async () => {
    await mongoose.connection.close(); // sever the app's connection
    await mongo.stop();
    const res = await http().get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error?.mongodb ?? res.body.details?.mongodb).toBeDefined();
    mongo = await startMongo(); // restore for afterAll symmetry
  });
});
