import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  assertSafeKey,
  ObjectStat,
  StorageNotFoundException,
  StorageService,
  StoredObject,
} from './storage.types';

export interface S3Settings {
  endpoint?: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Any S3-compatible endpoint (AWS, R2, MinIO) — selected via STORAGE_DRIVER=s3. */
export class S3Storage extends StorageService {
  readonly driver = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    super();
    this.client = new S3Client({
      region: settings.region ?? 'us-east-1',
      ...(settings.endpoint ? { endpoint: settings.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
  }

  async put(data: Buffer, opts: { userId: string; ext: string }): Promise<StoredObject> {
    const key = `${opts.userId}/${randomUUID()}.${opts.ext.replace(/^\./, '')}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, Body: data }),
    );
    return { key, sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
  }

  async getStream(key: string): Promise<Readable> {
    assertSafeKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      );
      return res.Body as Readable;
    } catch {
      throw new StorageNotFoundException(key);
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }))
      .catch(() => undefined);
  }

  async stat(key: string): Promise<ObjectStat> {
    assertSafeKey(key);
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      );
      return { size: res.ContentLength ?? 0 };
    } catch {
      throw new StorageNotFoundException(key);
    }
  }
}
