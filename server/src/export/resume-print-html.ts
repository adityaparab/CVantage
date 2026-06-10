import type { JsonResume } from '@cvantage/shared';

type R = Record<string, never>;

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const range = (a?: string, b?: string) => (a || b ? `${esc(a)} — ${esc(b ?? 'present')}` : '');

const section = (title: string, body: string) =>
  body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '';

const bullets = (items?: string[]) =>
  items?.length ? `<ul>${items.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';

/**
 * Print-grade HTML for the Puppeteer PDF (issue #81 / 9.4). Same data and
 * visual language as the app's resume view; everything escaped.
 */
export function buildResumePrintHtml(json: JsonResume, title: string): string {
  const j = json as Record<string, R[]> & { basics?: R & { location?: R } };
  const b = j.basics ?? ({} as NonNullable<typeof j.basics>);
  const contact = [b.email, b.phone, b.url, b.location?.city]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  const work = (j.work ?? [])
    .map(
      (w: R & { highlights?: string[] }) => `
      <article>
        <header><strong>${esc([w.position, w.name].filter(Boolean).join(' · '))}</strong>
        <span class="dates">${range(w.startDate, w.endDate)}</span></header>
        ${w.summary ? `<p>${esc(w.summary)}</p>` : ''}
        ${bullets(w.highlights)}
      </article>`,
    )
    .join('');

  const education = (j.education ?? [])
    .map(
      (e: R) => `
      <article><header><strong>${esc([e.studyType, e.area, e.institution].filter(Boolean).join(' · '))}</strong>
      <span class="dates">${range(e.startDate, e.endDate)}</span></header></article>`,
    )
    .join('');

  const skills = (j.skills ?? [])
    .map(
      (k: R & { keywords?: string[] }) =>
        `<p><strong>${esc(k.name)}</strong>${k.level ? ` (${esc(k.level)})` : ''}${
          k.keywords?.length ? `: ${esc(k.keywords.join(', '))}` : ''
        }</p>`,
    )
    .join('');

  const projects = (j.projects ?? [])
    .map(
      (p: R & { highlights?: string[] }) => `
      <article><header><strong>${esc(p.name)}</strong>
      <span class="dates">${range(p.startDate, p.endDate)}</span></header>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}${bullets(p.highlights)}</article>`,
    )
    .join('');

  const simple = (rows: R[] | undefined, fmt: (r: R) => string) =>
    (rows ?? []).map((r) => `<p>${fmt(r)}</p>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; }
  body { font: 10.5pt/1.5 'Helvetica Neue', Arial, sans-serif; color: #0b0b22; }
  h1 { font-size: 22pt; text-align: center; letter-spacing: -0.02em; }
  .label { text-align: center; color: #1c17ff; font-size: 12pt; margin-top: 2pt; }
  .contact { text-align: center; color: #555; font-size: 9pt; margin: 6pt 0 10pt; }
  .summary { font-style: italic; margin-bottom: 6pt; }
  h2 { font-size: 9.5pt; letter-spacing: 0.14em; text-transform: uppercase;
       color: #1c17ff; border-bottom: 1px solid #e5e7f0; padding-bottom: 2pt;
       margin: 12pt 0 6pt; }
  article { margin-bottom: 7pt; break-inside: avoid; }
  header { display: flex; justify-content: space-between; gap: 8pt; }
  .dates { color: #666; font-style: italic; font-size: 9pt; white-space: nowrap; }
  ul { padding-left: 14pt; margin-top: 2pt; }
  li { margin-bottom: 1.5pt; }
  p { margin-bottom: 2pt; }
</style></head>
<body>
  ${b.name ? `<h1>${esc(b.name)}</h1>` : ''}
  ${b.label ? `<p class="label">${esc(b.label)}</p>` : ''}
  ${contact ? `<p class="contact">${contact}</p>` : ''}
  ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ''}
  ${section('Work experience', work)}
  ${section('Education', education)}
  ${section('Skills', skills)}
  ${section('Projects', projects)}
  ${section('Awards', simple(j.awards, (a) => `<strong>${esc(a.title)}</strong> · ${esc(a.awarder)} <span class="dates">${esc(a.date)}</span>`))}
  ${section('Certificates', simple(j.certificates, (c) => `<strong>${esc(c.name)}</strong> · ${esc(c.issuer)}`))}
  ${section('Publications', simple(j.publications, (p) => `<strong>${esc(p.name)}</strong> · ${esc(p.publisher)}`))}
  ${section('Languages', simple(j.languages, (l) => `${esc(l.language)} — ${esc(l.fluency)}`))}
  ${section('Interests', simple(j.interests, (i) => esc(i.name)))}
  ${section('References', simple(j.references, (r) => `<strong>${esc(r.name)}</strong>: ${esc(r.reference)}`))}
</body></html>`;
}
