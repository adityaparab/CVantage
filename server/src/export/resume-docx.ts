import type { JsonResume } from '@cvantage/shared';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

type R = Record<string, never>;
type Section = R[];

const dateRange = (a?: string, b?: string) => {
  if (!a && !b) return '';
  return `${a ?? ''} — ${b ?? 'present'}`;
};

const heading = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: '1C17FF' })],
  });

const line = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size })],
  });

const bullet = (text: string) =>
  new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 40 } });

const entryHeader = (left: string, right: string) =>
  new Paragraph({
    spacing: { before: 140, after: 40 },
    children: [
      new TextRun({ text: left, bold: true }),
      new TextRun({ text: right ? `   ${right}` : '', italics: true, color: '666666' }),
    ],
  });

/**
 * json-resume -> DOCX (issue #81 / 9.4, decision D11): every section mapped
 * with sane typography. Pure function so golden tests can read the package.
 */
export async function buildResumeDocx(json: JsonResume, title: string): Promise<Buffer> {
  const j = json as Record<string, Section> & {
    basics?: R & { location?: R; profiles?: Section };
  };
  const b = j.basics ?? ({} as NonNullable<typeof j.basics>);
  const children: Paragraph[] = [];

  // header
  if (b.name) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: b.name, bold: true, size: 56 })],
      }),
    );
  }
  if (b.label) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: b.label, color: '1C17FF', size: 26 })],
      }),
    );
  }
  const contact = [b.email, b.phone, b.url, b.location?.city, b.location?.countryCode]
    .filter(Boolean)
    .join('  ·  ');
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: contact, size: 20, color: '555555' })],
      }),
    );
  }
  if (b.summary) children.push(line(b.summary, { italics: true }));

  if (j.work?.length) {
    children.push(heading('Work experience'));
    for (const w of j.work as Array<R & { highlights?: string[] }>) {
      children.push(
        entryHeader(
          [w.position, w.name].filter(Boolean).join(' · '),
          dateRange(w.startDate, w.endDate),
        ),
      );
      if (w.summary) children.push(line(w.summary));
      for (const h of w.highlights ?? []) children.push(bullet(h));
    }
  }

  if (j.volunteer?.length) {
    children.push(heading('Volunteer'));
    for (const w of j.volunteer as Array<R & { highlights?: string[] }>) {
      children.push(
        entryHeader(
          [w.position, w.organization].filter(Boolean).join(' · '),
          dateRange(w.startDate, w.endDate),
        ),
      );
      if (w.summary) children.push(line(w.summary));
      for (const h of w.highlights ?? []) children.push(bullet(h));
    }
  }

  if (j.education?.length) {
    children.push(heading('Education'));
    for (const e of j.education as Array<R & { courses?: string[] }>) {
      children.push(
        entryHeader(
          [e.studyType, e.area, e.institution].filter(Boolean).join(' · '),
          dateRange(e.startDate, e.endDate),
        ),
      );
      if (e.score) children.push(line(`Score: ${e.score}`));
      for (const c of e.courses ?? []) children.push(bullet(c));
    }
  }

  if (j.skills?.length) {
    children.push(heading('Skills'));
    for (const k of j.skills as Array<R & { keywords?: string[] }>) {
      children.push(
        line(
          `${k.name ?? ''}${k.level ? ` (${k.level})` : ''}${
            k.keywords?.length ? `: ${k.keywords.join(', ')}` : ''
          }`,
        ),
      );
    }
  }

  if (j.projects?.length) {
    children.push(heading('Projects'));
    for (const p of j.projects as Array<R & { highlights?: string[]; keywords?: string[] }>) {
      children.push(entryHeader(p.name ?? '', dateRange(p.startDate, p.endDate)));
      if (p.description) children.push(line(p.description));
      for (const h of p.highlights ?? []) children.push(bullet(h));
      if (p.keywords?.length) children.push(line(`Keywords: ${p.keywords.join(', ')}`, { italics: true }));
    }
  }

  if (j.awards?.length) {
    children.push(heading('Awards'));
    for (const a of j.awards as Section) {
      children.push(entryHeader([a.title, a.awarder].filter(Boolean).join(' · '), a.date ?? ''));
      if (a.summary) children.push(line(a.summary));
    }
  }

  if (j.certificates?.length) {
    children.push(heading('Certificates'));
    for (const c of j.certificates as Section) {
      children.push(entryHeader([c.name, c.issuer].filter(Boolean).join(' · '), c.date ?? ''));
    }
  }

  if (j.publications?.length) {
    children.push(heading('Publications'));
    for (const p of j.publications as Section) {
      children.push(entryHeader([p.name, p.publisher].filter(Boolean).join(' · '), p.releaseDate ?? ''));
      if (p.summary) children.push(line(p.summary));
    }
  }

  if (j.languages?.length) {
    children.push(heading('Languages'));
    for (const l of j.languages as Section) {
      children.push(line([l.language, l.fluency].filter(Boolean).join(' — ')));
    }
  }

  if (j.interests?.length) {
    children.push(heading('Interests'));
    for (const i of j.interests as Array<R & { keywords?: string[] }>) {
      children.push(line(`${i.name ?? ''}${i.keywords?.length ? `: ${i.keywords.join(', ')}` : ''}`));
    }
  }

  if (j.references?.length) {
    children.push(heading('References'));
    for (const r of j.references as Section) {
      children.push(entryHeader(r.name ?? '', ''));
      if (r.reference) children.push(line(r.reference, { italics: true }));
    }
  }

  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
