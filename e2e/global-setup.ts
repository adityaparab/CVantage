import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Build the upload fixture with the server's own pdfkit dependency. */
export default async function globalSetup(): Promise<void> {
  const dir = join(__dirname, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const { default: PDFDocument } = await import('pdfkit');
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      writeFileSync(join(dir, 'sample-resume.pdf'), Buffer.concat(chunks));
      resolve();
    });
    doc.on('error', reject);
    doc
      .fontSize(18)
      .text('Ada Lovelace')
      .fontSize(12)
      .text('Senior Software Engineer - London')
      .moveDown()
      .text('Experience: Analytical Engines Ltd (2020-01 to present)')
      .text('- Cut compute time 40%')
      .text('Skills: TypeScript, NestJS, MongoDB');
    doc.end();
  });
}
