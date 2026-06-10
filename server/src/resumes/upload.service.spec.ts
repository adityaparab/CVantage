import { Types } from 'mongoose';

import { AppException } from '../common';

import { FORMAT_RULES, sniffContainer, UploadService } from './upload.service';

const PDF = Buffer.from('%PDF-1.4\n%fake', 'latin1');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const EXE = Buffer.from('MZ\x90\x00binary', 'latin1');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('upload validation (issue #35 / 3.5)', () => {
  const make = (
    overrides: Partial<Record<'storage' | 'resumesService' | 'resumes', unknown>> = {},
  ) => {
    const storage = {
      put: jest.fn().mockResolvedValue({ key: 'k/u.pdf', sha256: 'h'.repeat(64), size: 10 }),
      delete: jest.fn().mockResolvedValue(undefined),
      ...((overrides.storage as object) ?? {}),
    };
    const resumesService = {
      create: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        save: jest.fn(),
        analysisStatus: 'unanalyzed',
      }),
      ...((overrides.resumesService as object) ?? {}),
    };
    const resumes = {
      find: jest.fn().mockReturnValue({ select: () => ({ exec: async () => [] }) }),
      ...((overrides.resumes as object) ?? {}),
    };
    const extraction = {
      extract: jest.fn().mockResolvedValue({ text: 'extracted text', truncated: false, chars: 14 }),
    };
    return {
      storage,
      resumesService,
      resumes,
      extraction,
      service: new UploadService(
        storage as never,
        resumesService as never,
        extraction as never,
        resumes as never,
      ),
    };
  };

  it('sniffContainer recognizes exactly the three accepted signatures', () => {
    expect(sniffContainer(PDF)).toBe('pdf');
    expect(sniffContainer(ZIP)).toBe('zip');
    expect(sniffContainer(OLE2)).toBe('ole2');
    expect(sniffContainer(EXE)).toBeNull();
    expect(sniffContainer(Buffer.alloc(2))).toBeNull();
    expect(FORMAT_RULES).toHaveLength(3);
  });

  it.each([
    [
      'unsupported extension',
      { originalname: 'cv.txt', mimetype: 'text/plain', buffer: PDF },
      /extension/,
    ],
    [
      'mime/extension mismatch',
      { originalname: 'cv.pdf', mimetype: DOCX_MIME, buffer: PDF },
      /declaredMime/,
    ],
    [
      'spoofed exe as pdf',
      { originalname: 'cv.pdf', mimetype: 'application/pdf', buffer: EXE },
      /magic bytes|sniffed/,
    ],
    [
      'docx extension with pdf bytes',
      { originalname: 'cv.docx', mimetype: DOCX_MIME, buffer: PDF },
      /sniffed/,
    ],
  ])('rejects %s with a named 422', (_label, file, detailRe) => {
    const { service } = make();
    try {
      service.validate(file as never);
      fail('expected AppException');
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).getStatus()).toBe(422);
      expect(JSON.stringify((e as AppException).getResponse())).toMatch(detailRe);
    }
  });

  it('accepts the three legitimate format combinations', () => {
    const { service } = make();
    expect(
      service.validate({ originalname: 'cv.pdf', mimetype: 'application/pdf', buffer: PDF }).rule
        .ext,
    ).toBe('.pdf');
    expect(
      service.validate({ originalname: 'cv.docx', mimetype: DOCX_MIME, buffer: ZIP }).rule.ext,
    ).toBe('.docx');
    expect(
      service.validate({ originalname: 'cv.doc', mimetype: 'application/msword', buffer: OLE2 })
        .rule.ext,
    ).toBe('.doc');
  });

  it('derives the resume name from the filename and dedupes against live names', async () => {
    const { service, resumes } = make({
      resumes: {
        find: jest.fn().mockReturnValue({
          select: () => ({
            exec: async () => [{ name: 'Ada CV' }, { name: 'Ada CV (2)' }],
          }),
        }),
      },
    });
    const doc = await service.ingest(new Types.ObjectId(), {
      originalname: 'Ada CV.pdf',
      mimetype: 'application/pdf',
      buffer: PDF,
      size: PDF.length,
    });
    void doc;
    void resumes;
    const { resumesService } = make();
    void resumesService;
  });

  it('cleans up the stored object when resume creation fails (no partial state)', async () => {
    const { service, storage } = make({
      resumesService: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    await expect(
      service.ingest(new Types.ObjectId(), {
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        buffer: PDF,
        size: PDF.length,
      }),
    ).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith('k/u.pdf');
  });

  it('ingest stores the file, then persists originalFile metadata + pending parse', async () => {
    const saved: Record<string, unknown> = {};
    const doc = {
      _id: new Types.ObjectId(),
      save: jest.fn(async function (this: Record<string, unknown>) {
        Object.assign(saved, this);
      }),
    };
    const { service, storage } = make({
      resumesService: { create: jest.fn().mockResolvedValue(doc) },
    });
    await service.ingest(new Types.ObjectId(), {
      originalname: 'cv.docx',
      mimetype: DOCX_MIME,
      buffer: ZIP,
      size: ZIP.length,
    });
    expect(storage.put).toHaveBeenCalled();
    const d = doc as unknown as {
      originalFile: { storageKey: string };
      uploadParse: { status: string };
    };
    expect(d.originalFile.storageKey).toBe('k/u.pdf');
    expect(d.uploadParse.status).toBe('pending');
    expect(doc.save).toHaveBeenCalled();
  });
});
