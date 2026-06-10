import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { activeTraceIds, initOtel, withSpan } from './otel';

describe('otel helpers (issue #88 / 10.5)', () => {
  const exporter = new InMemorySpanExporter();
  let provider: NodeTracerProvider;

  beforeAll(() => {
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  beforeEach(() => exporter.reset());

  it('endpoint unset -> SDK never initialized (zero overhead path)', async () => {
    await expect(
      initOtel({ endpoint: undefined, serviceName: 'x', environment: 'test' }),
    ).resolves.toBe(false);
  });

  it('withSpan records name, attributes and success', async () => {
    const out = await withSpan('llm.invoke', { 'llm.model': 'gpt-4o' }, async (span) => {
      span.setAttributes({ 'llm.tokens.prompt': 42 });
      return 'ok';
    });
    expect(out).toBe('ok');
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe('llm.invoke');
    expect(spans[0]!.attributes).toMatchObject({ 'llm.model': 'gpt-4o', 'llm.tokens.prompt': 42 });
  });

  it('withSpan records exceptions and error status, then rethrows', async () => {
    await expect(
      withSpan('job.analysis', { 'job.queue': 'analysis' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.status.code).toBe(2);
    expect(span.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('log lines get trace ids only while a span is active', async () => {
    expect(activeTraceIds()).toEqual({});
    await withSpan('test.span', {}, async () => {
      const ids = activeTraceIds();
      expect(ids.trace_id).toMatch(/^[a-f0-9]{32}$/);
      expect(ids.span_id).toMatch(/^[a-f0-9]{16}$/);
    });
    expect(activeTraceIds()).toEqual({});
  });
});
