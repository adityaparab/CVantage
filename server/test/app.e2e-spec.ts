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
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    // Import AFTER env so @nestjs/config validate sees the test URI.
    const { AppModule } = await import('../src/app.module.js');
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
    await mongo?.stop();
  });

  const http = () => request(app.getHttpServer() as App);

  it('GET /api/v1/health/live → 200', async () => {
    const res = await http().get('/api/v1/health/live').expect(200);
    expect(res.body.status).toBe('ok');
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
