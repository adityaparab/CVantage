import mongoose from 'mongoose';

import { validateEnv } from '../config/env.validation';
import {
  Analysis,
  AnalysisSchema,
  Resume,
  ResumeSchema,
  User,
  UserSchema,
} from '../database/schemas';

export interface CounterCorrection {
  userId: string;
  field: 'resumeCount' | 'analysisCount';
  from: number;
  to: number;
}

/**
 * Counter reconciliation (issue #33 / 3.3). Denormalized dashboard counters
 * drift without multi-document transactions (PLAN D15) — this recomputes them
 * from the source collections in bounded batches and fixes any difference.
 * Idempotent: a second run right after reports zero corrections.
 * Runs via `yarn db:reconcile-counters`; joins the in-process scheduler with
 * the job runner (#41) for the nightly cadence.
 */
export async function reconcileCounters(
  connection: mongoose.Connection,
  batchSize = 200,
): Promise<CounterCorrection[]> {
  const users =
    (connection.models[User.name] as mongoose.Model<User>) ??
    connection.model<User>(User.name, UserSchema);
  const resumes =
    (connection.models[Resume.name] as mongoose.Model<Resume>) ??
    connection.model<Resume>(Resume.name, ResumeSchema);
  const analyses =
    (connection.models[Analysis.name] as mongoose.Model<Analysis>) ??
    connection.model<Analysis>(Analysis.name, AnalysisSchema);

  const corrections: CounterCorrection[] = [];
  const cursor = users.find({}, { resumeCount: 1, analysisCount: 1 }).batchSize(batchSize).cursor();

  for await (const user of cursor) {
    const [resumeCount, analysisCount] = await Promise.all([
      resumes.countDocuments({ userId: user._id, deletedAt: null }).exec(),
      analyses.countDocuments({ userId: user._id }).exec(),
    ]);
    const $set: Record<string, number> = {};
    if (user.resumeCount !== resumeCount) {
      corrections.push({
        userId: String(user._id),
        field: 'resumeCount',
        from: user.resumeCount,
        to: resumeCount,
      });
      $set.resumeCount = resumeCount;
    }
    if (user.analysisCount !== analysisCount) {
      corrections.push({
        userId: String(user._id),
        field: 'analysisCount',
        from: user.analysisCount,
        to: analysisCount,
      });
      $set.analysisCount = analysisCount;
    }
    if (Object.keys($set).length > 0) {
      await users.updateOne({ _id: user._id }, { $set }).exec();
    }
  }
  return corrections;
}

/* CLI shim */
/* istanbul ignore next */
async function main(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);
  const conn = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  try {
    const corrections = await reconcileCounters(conn);
    if (corrections.length === 0) {
      console.log('counters consistent — no corrections');
    } else {
      for (const c of corrections) {
        console.log(`${c.userId} ${c.field}: ${c.from} -> ${c.to}`);
      }
      console.log(`${corrections.length} correction(s) applied`);
    }
  } finally {
    await conn.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((e) => {
    console.error(`db:reconcile-counters failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
