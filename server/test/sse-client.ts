import http from 'node:http';

export interface SseEvent {
  event: string;
  data: unknown;
  id?: string;
}

export interface SseCapture {
  status: number;
  headers: http.IncomingHttpHeaders;
  events: SseEvent[];
  comments: string[];
  closedByServer: boolean;
}

/** Minimal SSE consumer for e2e (issue #49 / 5.2). */
export function consumeSse(
  server: http.Server,
  path: string,
  cookie: string,
  opts: { maxMs?: number; until?: (events: SseEvent[]) => boolean } = {},
): Promise<SseCapture> {
  const address = server.address() as { port: number };
  return new Promise((resolve, reject) => {
    const events: SseEvent[] = [];
    const comments: string[] = [];
    let buffer = '';
    const req = http.get(
      {
        host: '127.0.0.1',
        port: address.port,
        path,
        headers: { Cookie: cookie, Accept: 'text/event-stream' },
      },
      (res) => {
        const finish = (closedByServer: boolean) =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            events,
            comments,
            closedByServer,
          });
        if ((res.statusCode ?? 0) !== 200) {
          res.resume();
          res.on('end', () => finish(true));
          return;
        }
        const timer = setTimeout(() => {
          req.destroy();
          finish(false);
        }, opts.maxMs ?? 8000);
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (block.startsWith(':')) {
              comments.push(block);
              continue;
            }
            const event = /event: (.+)/.exec(block)?.[1];
            const data = /data: (.+)/.exec(block)?.[1];
            const id = /id: (.+)/.exec(block)?.[1];
            if (event && data) events.push({ event, data: JSON.parse(data), id });
            if (opts.until?.(events)) {
              clearTimeout(timer);
              req.destroy();
              finish(false);
              return;
            }
          }
        });
        res.on('end', () => {
          clearTimeout(timer);
          finish(true);
        });
      },
    );
    req.on('error', (err) => {
      if ((err as { code?: string }).code === 'ECONNRESET') return; // we destroyed it
      reject(err);
    });
  });
}
