import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom's Blob lacks stream(); undici (inside MSW) needs it for blob bodies
if (typeof Blob !== 'undefined' && !Blob.prototype.stream) {
  Object.defineProperty(Blob.prototype, 'stream', {
    configurable: true,
    value(this: Blob) {
      const buffered = this.arrayBuffer();
      return new ReadableStream({
        async start(controller) {
          controller.enqueue(new Uint8Array(await buffered));
          controller.close();
        },
      });
    },
  });
}
