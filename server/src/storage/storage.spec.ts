import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Types } from 'mongoose';

import { LocalDiskStorage } from './local-disk.storage';
import { S3Storage } from './s3.storage';
import { assertSafeKey, StorageNotFoundException } from './storage.types';

const s3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: s3Send })),
  PutObjectCommand: jest.fn((input: unknown) => ({ kind: 'put', input })),
  GetObjectCommand: jest.fn((input: unknown) => ({ kind: 'get', input })),
  DeleteObjectCommand: jest.fn((input: unknown) => ({ kind: 'delete', input })),
  HeadObjectCommand: jest.fn((input: unknown) => ({ kind: 'head', input })),
}));

const userId = new Types.ObjectId().toHexString();

describe('LocalDiskStorage (issue #34 / 3.4)', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'cvantage-storage-'));
    storage = new LocalDiskStorage(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('put → stat → getStream round-trips bytes with a stable sha256', async () => {
    const data = Buffer.from('hello resume bytes');
    const stored = await storage.put(data, { userId, ext: 'pdf' });
    expect(stored.key).toMatch(new RegExp(`^${userId}/[A-Za-z0-9-]+\\.pdf$`));
    expect(stored.sha256).toHaveLength(64);
    expect(stored.size).toBe(data.length);

    expect((await storage.stat(stored.key)).size).toBe(data.length);

    const fresh = new LocalDiskStorage(root); // restart survival
    const chunks: Buffer[] = [];
    for await (const c of await fresh.getStream(stored.key)) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello resume bytes');

    const again = await storage.put(data, { userId, ext: 'pdf' });
    expect(again.sha256).toBe(stored.sha256); // content-derived, key-independent
    expect(again.key).not.toBe(stored.key);
  });

  it('traversal and malformed keys are uniformly not-found', async () => {
    for (const evil of [
      '../../etc/passwd',
      `${userId}/../escape.pdf`,
      '/abs/path.pdf',
      `${userId}/nul\0l.pdf`,
      `${userId}\\win.pdf`,
      'not-a-userid/x.pdf',
    ]) {
      await expect(storage.stat(evil)).rejects.toThrow(StorageNotFoundException);
      await expect(storage.getStream(evil)).rejects.toThrow(StorageNotFoundException);
    }
    expect(() => assertSafeKey(`${userId}/ok.pdf`)).not.toThrow();
  });

  it('delete is idempotent; stat after delete → typed 404; no tmp residue', async () => {
    const stored = await storage.put(Buffer.from('bye'), { userId, ext: 'docx' });
    await storage.delete(stored.key);
    await storage.delete(stored.key);
    await expect(storage.stat(stored.key)).rejects.toThrow(StorageNotFoundException);
    const leftovers = readdirSync(join(root, userId)).filter((f) => f.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

describe('S3Storage (issue #34 / 3.4)', () => {
  const storage = new S3Storage({
    endpoint: 'http://minio.local:9000',
    bucket: 'cvantage',
    accessKeyId: 'k',
    secretAccessKey: 's',
  });

  beforeEach(() => s3Send.mockReset());

  it('put issues PutObject with bucket + generated key and returns sha256', async () => {
    s3Send.mockResolvedValue({});
    const stored = await storage.put(Buffer.from('data'), { userId, ext: 'pdf' });
    const cmd = s3Send.mock.calls[0]![0] as { kind: string; input: Record<string, unknown> };
    expect(cmd.kind).toBe('put');
    expect(cmd.input.Bucket).toBe('cvantage');
    expect(cmd.input.Key).toBe(stored.key);
    expect(stored.sha256).toHaveLength(64);
  });

  it('missing objects map to the typed 404 for get/stat', async () => {
    s3Send.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    await expect(storage.stat(`${userId}/missing.pdf`)).rejects.toThrow(StorageNotFoundException);
    await expect(storage.getStream(`${userId}/missing.pdf`)).rejects.toThrow(
      StorageNotFoundException,
    );
  });

  it('rejects malformed keys before any network call', async () => {
    await expect(storage.stat('../../evil')).rejects.toThrow(StorageNotFoundException);
    expect(s3Send).not.toHaveBeenCalled();
  });
});
