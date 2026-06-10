import { Readable } from 'node:stream';

import { Types } from 'mongoose';

import { makeDocx, makeEmptyPdf, makeEncryptedPdf, makePdf } from '../../test/file-fixtures';

import {
  ExtractionError,
  ExtractionService,
  MAX_TEXT_CHARS,
  normalizeText,
} from './extraction.service';

const PDF_MIME = 'application/pdf';
const DOC_MIME = 'application/msword';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const storageWith = (buffer: Buffer) => ({
  getStream: jest.fn(async () => Readable.from([buffer])),
});

const make = (buffer: Buffer) => new ExtractionService(storageWith(buffer) as never);

const key = `${new Types.ObjectId().toHexString()}/file.pdf`;

describe('ExtractionService (issue #36 / 3.6)', () => {
  jest.setTimeout(20_000);

  it('pdf: extracts real text via the langchain loader', async () => {
    const pdf = await makePdf('Hello CVantage PDF extraction');
    const out = await make(pdf).extract(key, PDF_MIME);
    expect(out.text).toContain('Hello CVantage PDF extraction');
    expect(out.truncated).toBe(false);
    expect(out.chars).toBe(out.text.length);
  });

  it('docx: extracts paragraphs via mammoth', async () => {
    const docx = await makeDocx(['Ada Lovelace', 'Senior Engineer at Analytical Engines']);
    const out = await make(docx).extract(key, DOCX_MIME);
    expect(out.text).toContain('Ada Lovelace');
    expect(out.text).toContain('Analytical Engines');
  });

  it('encrypted pdf is refused with a typed failure', async () => {
    const err = await make(await makeEncryptedPdf('secret'))
      .extract(key, PDF_MIME)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(['ENCRYPTED_PDF', 'CORRUPT_FILE']).toContain((err as ExtractionError).code);
  });
});

describe('ExtractionService failure paths (issue #36 / 3.6)', () => {
  it('corrupt inputs map to CORRUPT_FILE per format', async () => {
    const garbage = Buffer.from('definitely not a real file format');
    for (const mime of [PDF_MIME, DOCX_MIME]) {
      const err = await make(garbage)
        .extract(key, mime)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe('CORRUPT_FILE');
    }
    const ole = [208, 207, 17, 224, 161, 177, 26, 225];
    const fakeDoc = Buffer.concat([Buffer.from(ole), Buffer.alloc(64, 7)]);
    const err = await make(fakeDoc)
      .extract(key, DOC_MIME)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe('CORRUPT_FILE');
  });

  it('image-only/empty content yields EMPTY_TEXT', async () => {
    const blank = await makeEmptyPdf();
    const err = await make(blank)
      .extract(key, PDF_MIME)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe('EMPTY_TEXT');
  });

  it('unsupported mime yields UNSUPPORTED_FORMAT', async () => {
    const err = await make(Buffer.from('x'))
      .extract(key, 'text/plain')
      .catch((e: unknown) => e);
    expect((err as ExtractionError).code).toBe('UNSUPPORTED_FORMAT');
  });

  it('hung extractors are bounded by the timeout', async () => {
    class HangingService extends ExtractionService {
      protected override extractPdf(): Promise<string> {
        return new Promise(() => undefined);
      }
    }
    jest.useFakeTimers();
    const svc = new HangingService(storageWith(Buffer.from('placeholder')) as never);
    const pending = svc.extract(key, PDF_MIME).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(30_001);
    const err = await pending;
    jest.useRealTimers();
    expect((err as ExtractionError).code).toBe('TIMEOUT');
  });
});

describe('normalizeText (issue #36 / 3.6)', () => {
  it('normalizes newlines, strips controls, collapses runs, trims', () => {
    const messy = 'A\r\nB C  D\t\tE\n\n\n\nF   ';
    expect(normalizeText(messy)).toBe('A\nB C D\tE\n\nF');
  });

  it('caps at 200k chars with the truncated flag (via service)', async () => {
    const big = 'word '.repeat(50_000);
    class BigService extends ExtractionService {
      protected override extractPdf(): Promise<string> {
        return Promise.resolve(big);
      }
    }
    const out = await new BigService(storageWith(Buffer.from('placeholder')) as never).extract(
      key,
      'application/pdf',
    );
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(MAX_TEXT_CHARS);
  });
});
