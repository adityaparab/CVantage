import mongoose from 'mongoose';

import { validateEnv } from '../config/env.validation';
import { MODEL_DEFINITIONS } from '../database/schemas';

export interface IndexSyncReport {
  model: string;
  dropped: string[];
  indexes: number;
}

/**
 * Explicit index synchronization for production (issue #20 / 1.11) —
 * autoIndex is off there (#12). syncIndexes creates missing indexes and
 * drops ones no longer defined; the report makes drift visible.
 */
export async function syncAllIndexes(connection: mongoose.Connection): Promise<IndexSyncReport[]> {
  const reports: IndexSyncReport[] = [];
  for (const { name, schema } of MODEL_DEFINITIONS) {
    const model =
      (connection.models[name] as mongoose.Model<unknown>) ?? connection.model(name, schema);
    const dropped = await model.syncIndexes();
    const indexes = await model.listIndexes();
    reports.push({ model: name, dropped, indexes: indexes.length });
  }
  return reports;
}

/* CLI shim */
/* istanbul ignore next */
async function main(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);
  const conn = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  try {
    const reports = await syncAllIndexes(conn);
    for (const r of reports) {
      console.log(
        `${r.model.padEnd(14)} indexes=${r.indexes}${r.dropped.length ? ` dropped=[${r.dropped.join(', ')}]` : ''}`,
      );
    }
  } finally {
    await conn.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((e) => {
    console.error(`db:indexes failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
