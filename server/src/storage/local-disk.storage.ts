import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import {
  assertSafeKey,
  ObjectStat,
  StorageNotFoundException,
  StorageService,
  StoredObject,
} from './storage.types';

/**
 * Local-disk driver (issue #34 / 3.4): default for dev and the Railway
 * volume. Atomic writes (tmp + fsync + rename) so partially-written files
 * never become visible; sha256 computed during write.
 */
export class LocalDiskStorage extends StorageService {
  readonly driver = 'local' as const;

  constructor(private readonly root: string) {
    super();
  }

  private absolute(key: string): string {
    assertSafeKey(key);
    const abs = resolve(this.root, key);
    if (!abs.startsWith(resolve(this.root) + sep)) {
      throw new StorageNotFoundException(key); // traversal == not found
    }
    return abs;
  }

  async put(data: Buffer, opts: { userId: string; ext: string }): Promise<StoredObject> {
    const key = `${opts.userId}/${randomUUID()}.${opts.ext.replace(/^\./, '')}`;
    const abs = this.absolute(key);
    await mkdir(dirname(abs), { recursive: true });

    const tmp = `${abs}.tmp-${randomUUID()}`;
    const handle = await open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(tmp, abs);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }

    return {
      key,
      sha256: createHash('sha256').update(data).digest('hex'),
      size: data.length,
    };
  }

  async getStream(key: string): Promise<Readable> {
    const abs = this.absolute(key);
    await this.stat(key); // existence check with typed 404
    return createReadStream(abs);
  }

  async delete(key: string): Promise<void> {
    const abs = this.absolute(key);
    await unlink(abs).catch(() => undefined); // idempotent
  }

  async stat(key: string): Promise<ObjectStat> {
    const abs = this.absolute(key);
    try {
      const s = await stat(abs);
      return { size: s.size };
    } catch {
      throw new StorageNotFoundException(key);
    }
  }
}
