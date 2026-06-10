import { Controller, Get } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Types } from 'mongoose';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AllExceptionsFilter } from '../common';
import { AppConfigService } from '../config';
import { User, UserRole, UserStatus } from '../database/schemas';

import { ActiveUserGuard } from './active-user.guard';
import { CurrentUser, Public, Roles } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestUser } from './request-user';
import { RolesGuard } from './roles.guard';
import { TokensService } from './tokens.service';

@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @Roles(UserRole.ADMIN)
  @Get('admin')
  admin(): { secret: true } {
    return { secret: true };
  }
}

const config = {
  core: { isProd: false },
  auth: {
    accessSecret: 'guards-spec-access-secret-guards-spec-acc',
    refreshSecret: 'guards-spec-refresh-secret-guards-spec-re',
    cookieSecret: 'guards-spec-cookie-secret-guards-spec-coo',
    accessTtl: '15m',
    refreshTtl: '30d',
  },
};

describe('RBAC guards & identity context (issue #24 / 2.3)', () => {
  const candidateId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const deactivatedId = new Types.ObjectId();
  const docs = new Map<string, Record<string, unknown>>([
    [
      String(candidateId),
      {
        _id: candidateId,
        email: 'cand@x.test',
        fullName: 'Cand',
        role: UserRole.CANDIDATE,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        lastActiveAt: new Date(Date.now() - 10 * 60_000),
      },
    ],
    [
      String(adminId),
      {
        _id: adminId,
        email: 'admin@x.test',
        fullName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    ],
    [
      String(deactivatedId),
      {
        _id: deactivatedId,
        email: 'gone@x.test',
        fullName: 'Gone',
        role: UserRole.CANDIDATE,
        status: UserStatus.DEACTIVATED,
        emailVerified: true,
      },
    ],
  ]);

  const usersModel = {
    findById: jest.fn((id: Types.ObjectId) => ({
      lean: () => ({ exec: async () => docs.get(String(id)) ?? null }),
    })),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
  };
  const authTokensModel = {
    create: jest.fn(async (d: unknown) => d),
    findOne: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
  };

  let app: NestExpressApplication;
  let tokens: TokensService;

  beforeAll(async () => {
    tokens = new TokensService(
      authTokensModel as never,
      new JwtService({}),
      config as never,
      { record: jest.fn() } as never,
    );

    const ref2 = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
      controllers: [ProbeController],
      providers: [
        { provide: TokensService, useValue: tokens },
        { provide: AppConfigService, useValue: config },
        { provide: getModelToken(User.name), useValue: usersModel },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ActiveUserGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = ref2.createNestApplication<NestExpressApplication>({ logger: false });
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => usersModel.updateOne.mockClear());

  const http = () => request(app.getHttpServer() as App);
  const tokenFor = (id: Types.ObjectId, role: UserRole, email: string) =>
    tokens.signAccess({ sub: String(id), role, email });

  it('@Public routes pass with no credentials', async () => {
    await http().get('/probe/open').expect(200);
  });

  it('anonymous and garbage tokens → 401 envelope', async () => {
    const anon = await http().get('/probe/me').expect(401);
    expect(anon.body.error).toBe('Unauthorized');
    await http().get('/probe/me').set('Authorization', 'Bearer garbage.token.here').expect(401);
  });

  it('valid bearer attaches the CURRENT account state as req.user', async () => {
    const res = await http()
      .get('/probe/me')
      .set(
        'Authorization',
        `Bearer ${await tokenFor(candidateId, UserRole.CANDIDATE, 'cand@x.test')}`,
      )
      .expect(200);
    expect(res.body).toMatchObject({
      id: String(candidateId),
      email: 'cand@x.test',
      role: 'candidate',
      status: 'active',
    });
  });

  it('access cookie works as a bearer alternative', async () => {
    const t = await tokenFor(candidateId, UserRole.CANDIDATE, 'cand@x.test');
    await http().get('/probe/me').set('Cookie', `cvantage.access=${t}`).expect(200);
  });

  it('expired tokens → 401', async () => {
    const expired = await new JwtService({}).signAsync(
      { email: 'cand@x.test', role: 'candidate' },
      {
        subject: String(candidateId),
        secret: config.auth.accessSecret,
        algorithm: 'HS256',
        issuer: 'cvantage',
        audience: 'cvantage-api',
        expiresIn: '1ms',
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    await http().get('/probe/me').set('Authorization', `Bearer ${expired}`).expect(401);
  });

  it('deactivated account with a valid token → 403 immediately', async () => {
    const t = await tokenFor(deactivatedId, UserRole.CANDIDATE, 'gone@x.test');
    const res = await http().get('/probe/me').set('Authorization', `Bearer ${t}`).expect(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it('role matrix: candidate → admin route 403; admin → 200', async () => {
    const cand = await tokenFor(candidateId, UserRole.CANDIDATE, 'cand@x.test');
    await http().get('/probe/admin').set('Authorization', `Bearer ${cand}`).expect(403);
    const admin = await tokenFor(adminId, UserRole.ADMIN, 'admin@x.test');
    await http().get('/probe/admin').set('Authorization', `Bearer ${admin}`).expect(200);
  });

  it('lastActiveAt bump uses the atomic 5-minute throttle condition', async () => {
    const t = await tokenFor(candidateId, UserRole.CANDIDATE, 'cand@x.test');
    await http().get('/probe/me').set('Authorization', `Bearer ${t}`).expect(200);
    expect(usersModel.updateOne).toHaveBeenCalledTimes(1);
    const [filter] = usersModel.updateOne.mock.calls[0] as [Record<string, unknown>];
    expect(JSON.stringify(filter)).toContain('lastActiveAt');
    expect(JSON.stringify(filter)).toContain('$or');
  });

  it('fresh lastActiveAt skips the write entirely (local throttle)', async () => {
    const t = await tokenFor(adminId, UserRole.ADMIN, 'admin@x.test');
    docs.get(String(adminId))!.lastActiveAt = new Date();
    await http().get('/probe/me').set('Authorization', `Bearer ${t}`).expect(200);
    expect(usersModel.updateOne).not.toHaveBeenCalled();
  });
});
