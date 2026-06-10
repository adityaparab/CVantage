import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { configureApp } from '../src/app.setup';
import { setupSwagger } from '../src/docs/swagger.setup';

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

  it('GET /api/v1/health/ready → 503 once mongo stops (readiness flip)', async () => {
    await mongoose.connection.close(); // sever the app's connection
    await mongo.stop();
    const res = await http().get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error?.mongodb ?? res.body.details?.mongodb).toBeDefined();
    mongo = await startMongo(); // restore for afterAll symmetry
  });
});
