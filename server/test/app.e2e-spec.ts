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
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    // Import AFTER env so @nestjs/config validate sees the test URI.
    const { AppModule } = await import('../src/app.module');
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
      ([] as string[]).concat((res.headers['set-cookie'] as string[]) ?? []);
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
      const cookies = ([] as string[]).concat((login.headers['set-cookie'] as string[]) ?? []);
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

  it('GET /api/v1/health/ready → 503 once mongo stops (readiness flip)', async () => {
    await mongoose.connection.close(); // sever the app's connection
    await mongo.stop();
    const res = await http().get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error?.mongodb ?? res.body.details?.mongodb).toBeDefined();
    mongo = await startMongo(); // restore for afterAll symmetry
  });
});
