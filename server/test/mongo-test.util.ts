import type { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Shared mongodb-memory-server bootstrap (issue #19 / 1.10).
 * First use downloads a mongod binary; in restricted sandboxes that download
 * can be unavailable — suites call `describeWithMongo` so they run wherever
 * a binary is obtainable (CI, dev machines) and skip loudly elsewhere.
 */
export interface MongoTestContext {
  uri: string;
  stop: () => Promise<void>;
}

export async function startMongo(): Promise<MongoTestContext> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server: MongoMemoryServer = await MongoMemoryServer.create();
  return {
    uri: server.getUri('cvantage-test'),
    stop: async () => {
      await server.stop();
    },
  };
}

export async function mongoAvailable(): Promise<boolean> {
  try {
    const ctx = await startMongo();
    await ctx.stop();
    return true;
  } catch {
    return false;
  }
}
