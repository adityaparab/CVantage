import { FULL_SAMPLE_RESUME } from '@cvantage/shared';
import JSZip from 'jszip';
import { Types } from 'mongoose';

import { AppException } from '../common';

import { ExportService, slugify } from './export.service';
import { buildResumeDocx } from './resume-docx';
import { buildResumePrintHtml } from './resume-print-html';

const ids = { user: new Types.ObjectId(), resume: new Types.ObjectId() };

const modelWith = (doc: unknown) => ({
  findOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(doc) })),
});

const resumeDoc = (over: Record<string, unknown> = {}) => ({
  _id: ids.resume,
  userId: ids.user,
  name: 'Backend Resume — 2026!',
  jsonResume: FULL_SAMPLE_RESUME,
  deletedAt: null,
  __v: 3,
  ...over,
});

const makeService = (doc: unknown, concurrency = 2) => {
  class TestExport extends ExportService {
    rendered = 0;
    protected override renderPdf(): Promise<Buffer> {
      this.rendered += 1;
      return new Promise((resolve) => setTimeout(() => resolve(Buffer.from('%PDF-1.7 fake')), 30));
    }
  }
  return new TestExport(
    modelWith(doc) as never,
    { exports: { concurrency, chromiumPath: '/usr/bin/chromium' } } as never,
  );
};

describe('docx golden check (issue #81 / 9.4)', () => {
  it('every section of the full fixture lands in the package, no mojibake', async () => {
    const buffer = await buildResumeDocx(FULL_SAMPLE_RESUME, 'Golden');
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // valid zip container
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const expected of [
      'WORK EXPERIENCE',
      'EDUCATION',
      'SKILLS',
      'PROJECTS',
      'LANGUAGES',
    ]) {
      expect(xml).toContain(expected);
    }
    const j = FULL_SAMPLE_RESUME as { basics: { name: string } };
    expect(xml).toContain(j.basics.name);
  });

  it('special characters survive and stay escaped in the print html', () => {
    const html = buildResumePrintHtml(
      {
        basics: { name: 'Ada & "Bob" <Lovelace>', summary: 'C++ & résumé ✓' },
      } as never,
      't',
    );
    expect(html).toContain('Ada &amp; &quot;Bob&quot; &lt;Lovelace&gt;');
    expect(html).toContain('résumé ✓');
    expect(html).not.toContain('<Lovelace>');
  });

  it('print html renders every populated section', () => {
    const html = buildResumePrintHtml(FULL_SAMPLE_RESUME, 't');
    for (const h of ['Work experience', 'Education', 'Skills', 'Projects', 'Languages']) {
      expect(html).toContain(`<h2>${h}</h2>`);
    }
  });
});

describe('ExportService rules (issue #81 / 9.4)', () => {
  it('foreign id -> 404; deleted -> 410; slug filenames', async () => {
    await expect(
      makeService(null).export(ids.user, ids.resume, 'docx'),
    ).rejects.toMatchObject({ status: 404 });
    const gone = await makeService(resumeDoc({ deletedAt: new Date() }))
      .export(ids.user, ids.resume, 'docx')
      .catch((e: unknown) => e);
    expect((gone as AppException).getStatus()).toBe(410);
    expect(slugify('Backend Resume — 2026!')).toBe('backend-resume-2026');
  });

  it('per-version cache: second export reuses the buffer (no re-render)', async () => {
    const svc = makeService(resumeDoc());
    const a = await svc.export(ids.user, ids.resume, 'pdf');
    const b = await svc.export(ids.user, ids.resume, 'pdf');
    expect((svc as unknown as { rendered: number }).rendered).toBe(1);
    expect(b.buffer).toBe(a.buffer);
    expect(a.filename).toBe('backend-resume-2026.pdf');
    expect(a.contentType).toBe('application/pdf');
  });

  it('concurrency cap: 5 parallel pdf exports never exceed the limit', async () => {
    // distinct versions defeat the cache so all 5 really render
    let v = 0;
    const svc = makeService(resumeDoc()) as ExportService & { rendered: number };
    const model = (svc as unknown as { resumes: { findOne: jest.Mock } }).resumes;
    model.findOne.mockImplementation(() => ({
      exec: jest.fn().mockResolvedValue(resumeDoc({ __v: (v += 1) })),
    }));
    let peak = 0;
    const origAcquire = Object.getPrototypeOf(svc);
    void origAcquire;
    const watcher = setInterval(() => {
      peak = Math.max(peak, svc.activeExports);
    }, 5);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.export(ids.user, ids.resume, 'pdf')),
    );
    clearInterval(watcher);
    expect(results).toHaveLength(5);
    expect(svc.rendered).toBe(5);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('pdf without a chromium path is a clear 503', async () => {
    const svc = new ExportService(
      modelWith(resumeDoc()) as never,
      { exports: { concurrency: 2, chromiumPath: undefined } } as never,
    );
    const err = await svc.export(ids.user, ids.resume, 'pdf').catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(503);
    expect((err as Error).message).toContain('PUPPETEER_EXECUTABLE_PATH');
  });
});
