import { resolve } from 'path';

import argon2 from 'argon2';
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { ARGON2_OPTIONS } from '../auth/password-hasher.service';
import { validateEnv } from '../config/env.validation';
import { User, UserRole, UserSchema, UserStatus } from '../database/schemas';

export interface SeedResult {
  created: boolean;
  email: string;
}

config({ path: resolve(process.cwd(), '../.env') });

/**
 * Idempotent first-admin bootstrap (issue #20 / 1.11).
 * PROMPT.md forbids an admin registration flow — without this, no admin
 * can ever exist. Promotes an existing user with the same email.
 */
export async function seedAdmin(
  connection: mongoose.Connection,
  email: string,
  password: string,
): Promise<SeedResult> {
  const model =
    (connection.models[User.name] as mongoose.Model<User>) ??
    connection.model<User>(User.name, UserSchema);

  const existing = await model.findOne({ email: email.toLowerCase() }).exec();
  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      existing.role = UserRole.ADMIN;
      await existing.save();
      return { created: false, email: existing.email };
    }
    return { created: false, email: existing.email };
  }

  await model.create({
    email,
    fullName: 'CVantage Admin',
    passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerified: true,
  });
  return { created: true, email: email.toLowerCase() };
}

/* CLI shim — reads validated env, connects, seeds, exits. */
/* istanbul ignore next */
async function main(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('seed:admin requires ADMIN_EMAIL and ADMIN_PASSWORD in the environment');
    process.exit(1);
  }
  const conn = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  try {
    const result = await seedAdmin(conn, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
    console.log(
      result.created
        ? `admin created: ${result.email}`
        : `admin already present: ${result.email} (no-op)`,
    );
  } finally {
    await conn.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((e) => {
    console.error(`seed:admin failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
