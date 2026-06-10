import { _setSentryForTests, captureServerError, scrubEvent, scrubValue } from './sentry';

describe('sentry scrubber (issue #87 / 10.4)', () => {
  it('drops sensitive keys at any depth and masks emails/tokens in strings', () => {
    const event = scrubEvent({
      message: 'user ada@example.com failed with token sk-live-abcdef123456',
      extra: {
        email: 'ada@example.com',
        jsonResume: { basics: { name: 'secret resume' } },
        originalText: 'full resume text',
        jobDescription: 'the jd',
        nested: { authorization: 'Bearer xyz', safe: 'keep me' },
      },
    });
    expect(event.message).toBe('user [email] failed with token [token]');
    expect(event.extra.email).toBe('[redacted]');
    expect(event.extra.jsonResume).toBe('[redacted]');
    expect(event.extra.originalText).toBe('[redacted]');
    expect(event.extra.jobDescription).toBe('[redacted]');
    expect(event.extra.nested).toEqual({ authorization: '[redacted]', safe: 'keep me' });
  });

  it('masks JWTs too', () => {
    expect(scrubValue('jwt eyJabc.def_ghi-jkl here')).toBe('jwt [token] here');
  });
});

describe('capture gating (issue #87 / 10.4)', () => {
  afterEach(() => _setSentryForTests(null));

  it('4xx envelopes never create events; 5xx do; disabled -> nothing', () => {
    const capture = jest.fn();
    _setSentryForTests({ captureException: capture });
    captureServerError(new Error('not found'), { status: 404, requestId: 'r1' });
    captureServerError(new Error('validation'), { status: 422, requestId: 'r2' });
    expect(capture).not.toHaveBeenCalled();
    captureServerError(new Error('boom'), { status: 500, requestId: 'r3', path: '/api/v1/x' });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![1]).toMatchObject({ tags: { requestId: 'r3', status: '500' } });

    _setSentryForTests(null); // DSN unset -> no-op even for 500s
    captureServerError(new Error('boom'), { status: 500 });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
