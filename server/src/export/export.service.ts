import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppException } from '../common';
import { AppConfigService } from '../config';
import { Resume } from '../database/schemas';

import { buildResumeDocx } from './resume-docx';
import { buildResumePrintHtml } from './resume-print-html';

export type ExportFormat = 'docx' | 'pdf';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const CACHE_TTL_MS = 10 * 60 * 1000;

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'resume';

/** Tiny semaphore - exports are CPU/RAM heavy (esp. chromium). */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
    } else {
      await new Promise<void>((resolve) => this.queue.push(resolve));
      this.active += 1;
    }
    return () => {
      this.active -= 1;
      this.queue.shift()?.();
    };
  }

  get current(): number {
    return this.active;
  }
}

/**
 * Resume export (issue #81 / 9.4, decision D11): DOCX via the docx package,
 * PDF via puppeteer-core printing a dedicated HTML template. Owner-only;
 * deleted resumes are 410. Per resume-version+format cache (10 min) and an
 * env-tunable concurrency limit keep cost bounded.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly semaphore: Semaphore;
  private readonly cache = new Map<string, { buffer: Buffer; expiresAt: number }>();

  constructor(
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    private readonly config: AppConfigService,
  ) {
    this.semaphore = new Semaphore(this.config.exports.concurrency);
  }

  get activeExports(): number {
    return this.semaphore.current;
  }

  async export(
    userId: Types.ObjectId,
    resumeId: Types.ObjectId,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const doc = await this.resumes.findOne({ _id: resumeId, userId }).exec();
    if (!doc) throw new NotFoundException('Resume not found');
    if (doc.deletedAt) {
      throw new AppException(410, 'Gone', 'This resume was deleted', {
        resumeId: String(resumeId),
      });
    }
    const version = (doc as unknown as { __v?: number }).__v ?? 0;
    const key = `${resumeId}:${version}:${format}`;
    const filename = `${slugify(doc.name)}.${format}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { buffer: cached.buffer, contentType: CONTENT_TYPES[format], filename };
    }

    const release = await this.semaphore.acquire();
    try {
      const buffer =
        format === 'docx'
          ? await buildResumeDocx(doc.jsonResume, doc.name)
          : await this.renderPdf(buildResumePrintHtml(doc.jsonResume, doc.name));
      this.cache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
      this.gcCache();
      return { buffer, contentType: CONTENT_TYPES[format], filename };
    } finally {
      release();
    }
  }

  /** Overridable for tests (chromium isn't available everywhere). */
  protected async renderPdf(html: string): Promise<Buffer> {
    const executablePath = this.config.exports.chromiumPath;
    if (!executablePath) {
      throw new AppException(
        503,
        'Service Unavailable',
        'PDF export is not configured on this deployment (PUPPETEER_EXECUTABLE_PATH)',
        {},
      );
    }
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath,
      // container-safe flags; the app runs as a non-root user (Docker #93)
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => this.logger.warn('chromium close failed'));
    }
  }

  private gcCache(): void {
    if (this.cache.size <= 50) return;
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expiresAt <= now) this.cache.delete(k);
    }
  }
}
