import type { Readable } from 'node:stream';

import { HttpStatus } from '@nestjs/common';

import { AppException } from '../common';

export interface StoredObject {
  key: string;
  sha256: string;
  size: number;
}

export interface ObjectStat {
  size: number;
}

/** Raised for unknown keys — the filter maps AppException to its status (404). */
export class StorageNotFoundException extends AppException {
  constructor(key: string) {
    super(HttpStatus.NOT_FOUND, 'Not Found', 'Stored object not found', { key });
  }
}

/**
 * Object storage abstraction (issue #34 / 3.4, PLAN D8).
 * Keys are ALWAYS server-generated (`{userId}/{uuid}.{ext}`) — drivers still
 * validate defensively against traversal in case a stored key is ever tampered.
 */
export abstract class StorageService {
  abstract readonly driver: 'local' | 's3';
  abstract put(data: Buffer, opts: { userId: string; ext: string }): Promise<StoredObject>;
  abstract getStream(key: string): Promise<Readable>;
  abstract delete(key: string): Promise<void>;
  abstract stat(key: string): Promise<ObjectStat>;
}

const KEY_RE = /^[a-f0-9]{24}\/[A-Za-z0-9_-]+\.[a-z0-9]{1,8}$/;

/** Defense-in-depth: reject anything that is not a generated key shape. */
export function assertSafeKey(key: string): void {
  if (
    !KEY_RE.test(key) ||
    key.includes('..') ||
    key.includes('\0') ||
    key.startsWith('/') ||
    key.includes('\\')
  ) {
    throw new StorageNotFoundException(key);
  }
}
