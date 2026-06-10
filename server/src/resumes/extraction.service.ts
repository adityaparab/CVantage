import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

import { StorageService } from '../storage/storage.types';

export type ExtractionFailureCode =
  | 'ENCRYPTED_PDF'
  | 'CORRUPT_FILE'
  | 'EMPTY_TEXT'
  | 'UNSUPPORTED_FORMAT'
  | 'TIMEOUT';

/** Typed extraction failure - persisted on uploadParse.error, never a 500. */
export class ExtractionError extends Error {
  constructor(
    readonly code: ExtractionFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionResult {
  text: string;
  truncated: boolean;
  chars: number;
}

export const MAX_TEXT_CHARS = 200_000;
const EXTRACTION_TIMEOUT_MS = 30_000;

const PDF_MIME = 'application/pdf';
const DOC_MIME = 'application/msword';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Text extraction (issue #36 / 3.6, per CLAUDE.md):
 *  - pdf  -> LangChain PDFLoader (pdf-parse)
 *  - docx -> mammoth.extractRawText
 *  - doc  -> word-extractor (mammoth does not read the legacy binary format)
 * Output is whitespace/control normalized and capped at 200k chars (schema
 * bound). Failures are typed and user-meaningful; nothing here hangs (30s cap).
 */
@Injectable()
export class ExtractionService {
  constructor(private readonly storage: StorageService) {}

  async extract(storageKey: string, mimeType: string): Promise<ExtractionResult> {
    const buffer = await this.readAll(storageKey);
    const raw = await this.withTimeout(this.extractByMime(buffer, mimeType));
    const text = normalizeText(raw);
    if (text.length === 0) {
      throw new ExtractionError(
        'EMPTY_TEXT',
        'No text could be extracted - the file may be image-only or empty',
      );
    }
    if (text.length > MAX_TEXT_CHARS) {
      return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true, chars: MAX_TEXT_CHARS };
    }
    return { text, truncated: false, chars: text.length };
  }

  protected extractByMime(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case PDF_MIME:
        return this.extractPdf(buffer);
      case DOCX_MIME:
        return this.extractDocx(buffer);
      case DOC_MIME:
        return this.extractDoc(buffer);
      default:
        return Promise.reject(
          new ExtractionError('UNSUPPORTED_FORMAT', `Unsupported content type: ${mimeType}`),
        );
    }
  }

  protected async extractPdf(buffer: Buffer): Promise<string> {
    // PDFLoader's file-path mode is environment-proof (Blob handling differs
    // across runtimes); the temp file lives for milliseconds.
    const dir = await mkdtemp(join(tmpdir(), 'cvantage-pdf-'));
    try {
      const path = join(dir, `${randomUUID()}.pdf`);
      await writeFile(path, buffer);
      const loader = new PDFLoader(path, { splitPages: false });
      const docs = await loader.load();
      return docs.map((d) => d.pageContent).join('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/encrypt|password/i.test(msg)) {
        throw new ExtractionError('ENCRYPTED_PDF', 'The PDF is password-protected');
      }
      throw new ExtractionError('CORRUPT_FILE', 'The PDF could not be read');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  protected async extractDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      throw new ExtractionError('CORRUPT_FILE', 'The DOCX file could not be read');
    }
  }

  protected async extractDoc(buffer: Buffer): Promise<string> {
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody();
    } catch {
      throw new ExtractionError('CORRUPT_FILE', 'The DOC file could not be read');
    }
  }

  private async readAll(storageKey: string): Promise<Buffer> {
    const stream = await this.storage.getStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private async withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ExtractionError('TIMEOUT', 'Extraction timed out')),
        EXTRACTION_TIMEOUT_MS,
      );
      timer.unref();
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

const TAB = 9;
const NEWLINE = 10;
const SPACE = 32;
const DEL = 127;

/** Drops C0 control chars (keeping tab + newline) and DEL — loop, not regex,
 *  so no control-character literals live in this source file. */
function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) as number;
    const isControl = (code < SPACE && code !== TAB && code !== NEWLINE) || code === DEL;
    if (!isControl) out += ch;
  }
  return out;
}

/** CRLF -> LF, strip control chars (keep newline/tab), collapse runs, trim. */
export function normalizeText(raw: string): string {
  return stripControlChars(raw.replace(/\r\n?/g, '\n'))
    .replace(/\t{2,}/g, '\t')
    .replace(/[^\S\n\t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
