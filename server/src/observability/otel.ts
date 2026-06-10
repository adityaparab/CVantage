import { Logger } from '@nestjs/common';
import { context, metrics, trace } from '@opentelemetry/api';
import type { Attributes, Span } from '@opentelemetry/api';

/**
 * OpenTelemetry (issue #88 / 10.5): traces + metrics, strictly gated by
 * OTEL_EXPORTER_OTLP_ENDPOINT. Without it the SDK is never constructed and
 * every helper below degrades to the API's built-in no-ops (zero overhead).
 * The flagship trace: HTTP -> job claim -> 3 analysis steps -> LLM calls,
 * all connected.
 */
let started = false;

export async function initOtel(opts: {
  endpoint?: string;
  serviceName: string;
  environment: string;
}): Promise<boolean> {
  if (!opts.endpoint || started) return started;
  const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }, { OTLPMetricExporter }, { PeriodicExportingMetricReader }] =
    await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/auto-instrumentations-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/exporter-metrics-otlp-http'),
      import('@opentelemetry/sdk-metrics'),
    ]);
  const sdk = new NodeSDK({
    serviceName: opts.serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${opts.endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${opts.endpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
      }),
    ],
  });
  sdk.start();
  started = true;
  new Logger('OTel').log(`tracing + metrics -> ${opts.endpoint}`);
  process.on('SIGTERM', () => void sdk.shutdown().catch(() => undefined));
  return true;
}

const tracer = () => trace.getTracer('cvantage');

/** Run fn inside a span; no-op tracer when OTel is disabled. */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: 2, message: (err as Error).message?.slice(0, 200) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** trace_id/span_id for log correlation - undefined when no active span. */
export function activeTraceIds(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  if (!ctx.traceId || /^0+$/.test(ctx.traceId)) return {};
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

/** SSE live-connection gauge (#88) - reads lazily, no-op when disabled. */
export function registerSseGauge(read: () => number): void {
  const meter = metrics.getMeter('cvantage');
  const gauge = meter.createObservableGauge('cvantage.sse.connections', {
    description: 'Live SSE connections',
  });
  gauge.addCallback((result) => result.observe(read()));
}
