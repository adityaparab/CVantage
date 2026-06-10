import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';

import { AppConfigService } from '../../config';
import { zodDto, ZodValidationPipe } from '../validation/zod.pipe';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

const probeSchema = z.object({
  basics: z.object({ email: z.string().email() }),
  work: z.array(z.object({ startDate: z.string().regex(/^\d{4}$/) })),
});
class ProbeDto extends zodDto(probeSchema) {}

@Controller()
class ProbeController {
  @Get('bad') bad(): never {
    throw new BadRequestException('nope');
  }
  @Get('unauthorized') unauthorized(): never {
    throw new UnauthorizedException();
  }
  @Get('forbidden') forbidden(): never {
    throw new ForbiddenException();
  }
  @Get('dup') dup(): never {
    const e = new Error('E11000 duplicate key') as Error & {
      code: number;
      keyValue: Record<string, unknown>;
    };
    e.code = 11000;
    e.keyValue = { email: 'a@b.co' };
    throw e;
  }
  @Get('version') version(): never {
    const e = new Error('version conflict') as Error & { name: string };
    e.name = 'VersionError';
    throw e;
  }
  @Get('cast') cast(): never {
    const e = new Error('Cast to ObjectId failed') as Error & { name: string };
    e.name = 'CastError';
    throw e;
  }
  @Get('throttled') throttled(): never {
    throw new HttpException(
      { error: 'Too Many Requests', message: 'Rate limit exceeded' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  @Get('boom') boom(): never {
    throw new Error('secret-internal-detail');
  }
  @Get('domain') domain(): never {
    throw new AppException(
      HttpStatus.CONFLICT,
      'Resume Name Taken',
      'A live resume already uses this name',
      {
        name: 'My Resume',
      },
    );
  }
  @Post('zod') zodRoute(@Body() body: ProbeDto): unknown {
    return body;
  }
}

async function bootProbe(isProd: boolean) {
  @Module({
    imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
    controllers: [ProbeController],
    providers: [
      { provide: AppConfigService, useValue: { core: { isProd } } },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_PIPE, useClass: ZodValidationPipe },
    ],
  })
  class ProbeModule {}
  const ref = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const app = ref.createNestApplication({ logger: false });
  await app.init();
  return app;
}

/** Normalize volatile fields for snapshots. */
const stable = (body: Record<string, unknown>): Record<string, unknown> => ({
  ...body,
  requestId: body.requestId ? '<requestId>' : undefined,
  timestamp: '<timestamp>',
});

describe('error contract (issue #14 / 1.5)', () => {
  let app: Awaited<ReturnType<typeof bootProbe>>;
  beforeAll(async () => {
    app = await bootProbe(false);
  });
  afterAll(async () => app.close());
  const http = () => request(app.getHttpServer() as App);

  it.each([
    ['/bad', 400],
    ['/unauthorized', 401],
    ['/forbidden', 403],
    ['/no-such-route', 404],
    ['/dup', 409],
    ['/version', 409],
    ['/cast', 400],
    ['/throttled', 429],
    ['/boom', 500],
    ['/domain', 409],
  ])('GET %s renders the envelope for %i', async (path, status) => {
    const res = await http().get(path).expect(status);
    expect(stable(res.body as Record<string, unknown>)).toMatchSnapshot();
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.path).toBe(path);
    expect(res.body.statusCode).toBe(status);
  });

  it('zod 422 lists exact field paths incl. array indices', async () => {
    const res = await http()
      .post('/zod')
      .send({ basics: { email: 'not-an-email' }, work: [{ startDate: 'March' }] })
      .expect(422);
    const details = res.body.details as { path: string; message: string }[];
    expect(details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['basics.email', 'work[0].startDate']),
    );
  });

  it('zod pipe replaces payload with parsed value (passthrough on success)', async () => {
    const res = await http()
      .post('/zod')
      .send({ basics: { email: 'a@b.co' }, work: [{ startDate: '2024' }], extra: 'stripped' })
      .expect(201);
    expect(res.body).toEqual({ basics: { email: 'a@b.co' }, work: [{ startDate: '2024' }] });
  });

  it('500 hides internals in production but keeps them in dev', async () => {
    const devRes = await http().get('/boom').expect(500);
    expect(devRes.body.message).toBe('secret-internal-detail');

    const prodApp = await bootProbe(true);
    const prodRes = await request(prodApp.getHttpServer() as App)
      .get('/boom')
      .expect(500);
    expect(prodRes.body.message).toBe('Something went wrong');
    expect(JSON.stringify(prodRes.body)).not.toContain('secret-internal-detail');
    expect(JSON.stringify(prodRes.body)).not.toContain('at ProbeController'); // no stacks ever
    await prodApp.close();
  });
});
