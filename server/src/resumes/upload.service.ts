import { extname } from 'node:path';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, Model } from 'mongoose';

import { AppException } from '../common';
import { Resume, ResumeDocument, ResumeSource, UploadParseStatus } from '../database/schemas';
import { StorageService } from '../storage/storage.types';

import { ResumesService } from './resumes.service';

export type SniffedContainer = 'pdf' | 'zip' | 'ole2';

/** Magic-byte container detection — only the three signatures we accept. */
export function sniffContainer(buffer: Buffer): SniffedContainer | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  )
    return 'zip';
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(ole)) return 'ole2';
  return null;
}

interface FormatRule {
  ext: '.pdf' | '.doc' | '.docx';
  mime: string;
  container: SniffedContainer;
}

export const FORMAT_RULES: FormatRule[] = [
  { ext: '.pdf', mime: 'application/pdf', container: 'pdf' },
  { ext: '.doc', mime: 'application/msword', container: 'ole2' },
  {
    ext: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    container: 'zip',
  },
];

export interface ValidatedUpload {
  rule: FormatRule;
  baseName: string;
}

/**
 * Upload intake (issue #35 / 3.5). The client is never trusted: extension,
 * declared MIME and the actual magic bytes must all agree, otherwise 422
 * names the mismatch. Storage and the resume row are created atomically —
 * any failure after the file is stored deletes the object again.
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly storage: StorageService,
    private readonly resumesService: ResumesService,
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
  ) {}

  validate(file: { originalname: string; mimetype: string; buffer: Buffer }): ValidatedUpload {
    const ext = extname(file.originalname).toLowerCase() as FormatRule['ext'];
    const rule = FORMAT_RULES.find((r) => r.ext === ext);
    if (!rule) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation Failed',
        'Only .pdf, .doc and .docx files are accepted',
        { extension: ext || '(none)' },
      );
    }
    if (file.mimetype !== rule.mime) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation Failed',
        'Declared content type does not match the file extension',
        { extension: rule.ext, declaredMime: file.mimetype, expectedMime: rule.mime },
      );
    }
    const container = sniffContainer(file.buffer);
    if (container !== rule.container) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation Failed',
        'File content does not match its extension (magic bytes mismatch)',
        { extension: rule.ext, expectedContainer: rule.container, sniffed: container ?? 'unknown' },
      );
    }
    const baseName =
      file.originalname
        .slice(0, file.originalname.length - ext.length)
        .trim()
        .slice(0, 180) || 'Uploaded Resume';
    return { rule, baseName };
  }

  /** Live-name dedupe: "Name", "Name (2)", "Name (3)"… against the unique index. */
  private async dedupedName(userId: Types.ObjectId, base: string): Promise<string> {
    const existing = await this.resumes
      .find({
        userId,
        deletedAt: null,
        name: new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(\\d+\\))?$`, 'i'),
      })
      .select('name')
      .exec();
    if (existing.length === 0) return base;
    const taken = new Set(existing.map((d) => d.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} (${i})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} (${Date.now()})`;
  }

  async ingest(
    userId: Types.ObjectId,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ): Promise<ResumeDocument> {
    const { rule, baseName } = this.validate(file);

    const stored = await this.storage.put(file.buffer, {
      userId: userId.toHexString(),
      ext: rule.ext.slice(1),
    });

    try {
      const name = await this.dedupedName(userId, baseName);
      const doc = await this.resumesService.create(
        userId,
        { name, jsonResume: {} },
        ResumeSource.UPLOADED,
      );
      doc.originalFile = {
        fileName: file.originalname.slice(0, 300),
        mimeType: rule.mime,
        sizeBytes: file.size,
        storageKey: stored.key,
        sha256: stored.sha256,
      };
      doc.uploadParse = { status: UploadParseStatus.PENDING } as never;
      await doc.save();
      // Parse job enqueue lands with #42 (4.4); status stays pending until then.
      return doc;
    } catch (err) {
      await this.storage.delete(stored.key); // no partial state
      throw err;
    }
  }
}
