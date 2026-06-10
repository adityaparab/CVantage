import { EventEmitter } from 'node:events';

import { Types } from 'mongoose';

import { AppException } from '../common';
import { ProgressBusService } from '../events';

import { SseHubService } from './sse-hub.service';
import { SseController } from './sse.controller';

/** Minimal Express-Response stand-in capturing the wire. */
const fakeRes = () => {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  return {
    emitter,
    chunks,
    headers,
    ended: false,
    status: jest.fn(),
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    flushHeaders: jest.fn(),
    write: jest.fn((s: string) => chunks.push(s)),
    end: jest.fn(function (this: { ended: boolean }) {
      (this as { ended: boolean }).ended = true;
      emitter.emit('close');
    }),
    on: (ev: string, fn: () => void) => emitter.on(ev, fn),
  };
};

const hubWith = (max = 5, heartbeatMs = 50) => {
  const shutdown = { registerDrainHook: jest.fn() };
  return new SseHubService(
    { sse: { maxConnectionsPerUser: max, heartbeatMs } } as never,
    shutdown as never,
  );
};

describe('SseHubService (issue #49 / 5.2)', () => {
  it('sets the proxy-safe headers exactly', () => {
    const hub = hubWith();
    const res = fakeRes();
    hub.open('u1', res as never);
    expect(res.headers).toMatchObject({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('caps concurrent streams per user with a 429 (other users unaffected)', () => {
    const hub = hubWith(2);
    hub.open('u1', fakeRes() as never);
    hub.open('u1', fakeRes() as never);
    expect(() => hub.open('u1', fakeRes() as never)).toThrow(AppException);
    expect(() => hub.open('u2', fakeRes() as never)).not.toThrow();
    expect(hub.liveConnections).toBe(3);
  });

  it('client disconnect frees the slot and fires onClose hooks', () => {
    const hub = hubWith(1);
    const res = fakeRes();
    const conn = hub.open('u1', res as never);
    const closed = jest.fn();
    conn.onClose(closed);
    res.emitter.emit('close');
    expect(closed).toHaveBeenCalled();
    expect(hub.liveConnections).toBe(0);
    expect(() => hub.open('u1', fakeRes() as never)).not.toThrow();
  });

  it('heartbeats reach every live stream within the configured interval', async () => {
    jest.useFakeTimers();
    const hub = hubWith(5, 100);
    const res = fakeRes();
    hub.open('u1', res as never);
    await jest.advanceTimersByTimeAsync(110);
    jest.useRealTimers();
    expect(res.chunks.filter((c) => c.includes(': ping'))).toHaveLength(1);
  });

  it('drain announces shutdown and ends every stream', async () => {
    const hub = hubWith();
    const a = fakeRes();
    const b = fakeRes();
    hub.open('u1', a as never);
    hub.open('u2', b as never);
    await hub.drain();
    for (const r of [a, b]) {
      expect(r.chunks.join('')).toContain('event: shutdown');
      expect(r.end).toHaveBeenCalled();
    }
    expect(hub.liveConnections).toBe(0);
  });
});

describe('SseController analysis stream (issue #49 / 5.2)', () => {
  const userId = new Types.ObjectId();
  const analysisId = new Types.ObjectId();
  const user = { id: userId.toHexString() } as never;

  const docWith = (status: string) =>
    ({
      _id: analysisId,
      resumeId: new Types.ObjectId(),
      name: 'A',
      status,
      steps: [],
      createdAt: new Date(),
    }) as never;

  const make = (statusSequence: string[]) => {
    const getById = jest.fn();
    for (const s of statusSequence) getById.mockResolvedValueOnce(docWith(s));
    const bus = new ProgressBusService();
    const ctl = new SseController(
      hubWith(),
      { getById } as never,
      { listActive: jest.fn().mockResolvedValue({ items: [], total: 0 }) } as never,
      bus,
    );
    return { ctl, bus, getById };
  };

  const parse = (chunks: string[]) =>
    chunks
      .join('')
      .split('\n\n')
      .filter((b) => b.includes('event: '))
      .map((b) => ({
        event: /event: (\w+)/.exec(b)![1],
        data: JSON.parse(/data: (.*)/.exec(b)![1] as string) as Record<string, unknown>,
      }));

  it('sends the snapshot first; terminal snapshot closes immediately (reconnect-safe)', async () => {
    const { ctl } = make(['completed']);
    const res = fakeRes();
    await ctl.analysisEvents(user, analysisId, res as never);
    const events = parse(res.chunks);
    expect(events[0]).toMatchObject({ event: 'snapshot', data: { status: 'completed' } });
    expect(res.end).toHaveBeenCalled(); // closed after terminal
  });

  it('streams status transitions from the bus and closes after terminal', async () => {
    const { ctl, bus } = make(['in_progress', 'in_progress', 'completed']);
    const res = fakeRes();
    await ctl.analysisEvents(user, analysisId, res as never);
    const publish = (status: string) =>
      bus.publish({
        type: 'analysis',
        analysisId: String(analysisId),
        resumeId: 'r',
        userId: (user as { id: string }).id,
        status,
      } as never);
    publish('in_progress');
    await new Promise((r) => setImmediate(r));
    publish('completed');
    await new Promise((r) => setImmediate(r));
    const events = parse(res.chunks);
    expect(events.map((e) => e.event)).toEqual(['snapshot', 'status', 'status']);
    expect(events.at(-1)!.data.status).toBe('completed');
    expect(res.end).toHaveBeenCalled();
  });

  it('foreign analysis rejects BEFORE any stream starts (clean 404 envelope)', async () => {
    const getById = jest.fn().mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    const ctl = new SseController(
      hubWith(),
      { getById } as never,
      { listActive: jest.fn() } as never,
      new ProgressBusService(),
    );
    const res = fakeRes();
    await expect(ctl.analysisEvents(user, analysisId, res as never)).rejects.toMatchObject({
      status: 404,
    });
    expect(res.write).not.toHaveBeenCalled();
  });

  it('bell stream: snapshot then refreshed list on every bus change', async () => {
    const listActive = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({
        items: [{ _id: 'n1', analysisId: 'a', type: 't', title: 'x', state: 'active' }],
        total: 1,
      });
    const bus = new ProgressBusService();
    const ctl = new SseController(
      hubWith(),
      { getById: jest.fn() } as never,
      { listActive } as never,
      bus,
    );
    const res = fakeRes();
    await ctl.notificationEvents(user, res as never);
    bus.publish({ type: 'notification', userId: (user as { id: string }).id, action: 'cleared' });
    await new Promise((r) => setImmediate(r));
    const events = parse(res.chunks);
    expect(events.map((e) => e.event)).toEqual(['snapshot', 'bell']);
    expect((events[1]!.data as { total: number }).total).toBe(1);
  });
});
