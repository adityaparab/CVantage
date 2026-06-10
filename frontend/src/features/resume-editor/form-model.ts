import { JSON_RESUME_DATE, pruneEmpty } from '@cvantage/shared';
import type { JsonResume } from '@cvantage/shared';
import { z } from 'zod';

/**
 * The editor's UI model (issue #69 / 8.5): arrays-of-strings become
 * newline/comma text for pleasant editing; convert at the boundary.
 * pruneEmpty guarantees placeholder-only fields are NEVER persisted.
 */

const dateField = z
  .string()
  .refine((v) => v === '' || JSON_RESUME_DATE.test(v), 'Use YYYY, YYYY-MM or YYYY-MM-DD');

const str = z.string();

const profileUi = z.object({ network: str, username: str, url: str });
const workUi = z.object({
  name: str,
  position: str,
  url: str,
  startDate: dateField,
  endDate: dateField,
  summary: str,
  highlights: str, // one per line
});
const volunteerUi = z.object({
  organization: str,
  position: str,
  url: str,
  startDate: dateField,
  endDate: dateField,
  summary: str,
  highlights: str,
});
const educationUi = z.object({
  institution: str,
  url: str,
  area: str,
  studyType: str,
  startDate: dateField,
  endDate: dateField,
  score: str,
  courses: str, // one per line
});
const awardUi = z.object({ title: str, date: dateField, awarder: str, summary: str });
const certificateUi = z.object({ name: str, date: dateField, issuer: str, url: str });
const publicationUi = z.object({
  name: str,
  publisher: str,
  releaseDate: dateField,
  url: str,
  summary: str,
});
const skillUi = z.object({ name: str, level: str, keywords: str }); // comma-separated
const languageUi = z.object({ language: str, fluency: str });
const interestUi = z.object({ name: str, keywords: str });
const referenceUi = z.object({ name: str, reference: str });
const projectUi = z.object({
  name: str,
  description: str,
  url: str,
  startDate: dateField,
  endDate: dateField,
  highlights: str,
  keywords: str,
  roles: str, // comma-separated
});

export const resumeFormSchema = z.object({
  basics: z.object({
    name: str,
    label: str,
    email: str.refine((v) => v === '' || /.+@.+\..+/.test(v), 'Enter a valid email'),
    phone: str,
    url: str,
    summary: str,
    location: z.object({
      address: str,
      postalCode: str,
      city: str,
      countryCode: str,
      region: str,
    }),
    profiles: z.array(profileUi),
  }),
  work: z.array(workUi),
  volunteer: z.array(volunteerUi),
  education: z.array(educationUi),
  awards: z.array(awardUi),
  certificates: z.array(certificateUi),
  publications: z.array(publicationUi),
  skills: z.array(skillUi),
  languages: z.array(languageUi),
  interests: z.array(interestUi),
  references: z.array(referenceUi),
  projects: z.array(projectUi),
});

export type ResumeFormValues = z.infer<typeof resumeFormSchema>;

const lines = (v?: string[]) => (v ?? []).join('\n');
const tags = (v?: string[]) => (v ?? []).join(', ');
const toLines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
const toTags = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const s = (v?: string) => v ?? '';

type R = Record<string, never>;

export function toFormModel(json: JsonResume): ResumeFormValues {
  const j = json as Record<string, R[]> & { basics?: R & { location?: R; profiles?: R[] } };
  const b = j.basics ?? ({} as NonNullable<typeof j.basics>);
  const loc = b.location ?? ({} as R);
  return {
    basics: {
      name: s(b.name),
      label: s(b.label),
      email: s(b.email),
      phone: s(b.phone),
      url: s(b.url),
      summary: s(b.summary),
      location: {
        address: s(loc.address),
        postalCode: s(loc.postalCode),
        city: s(loc.city),
        countryCode: s(loc.countryCode),
        region: s(loc.region),
      },
      profiles: (b.profiles ?? []).map((p) => ({
        network: s(p.network),
        username: s(p.username),
        url: s(p.url),
      })),
    },
    work: (j.work ?? []).map((w: R & { highlights?: string[] }) => ({
      name: s(w.name),
      position: s(w.position),
      url: s(w.url),
      startDate: s(w.startDate),
      endDate: s(w.endDate),
      summary: s(w.summary),
      highlights: lines(w.highlights),
    })),
    volunteer: (j.volunteer ?? []).map((w: R & { highlights?: string[] }) => ({
      organization: s(w.organization),
      position: s(w.position),
      url: s(w.url),
      startDate: s(w.startDate),
      endDate: s(w.endDate),
      summary: s(w.summary),
      highlights: lines(w.highlights),
    })),
    education: (j.education ?? []).map((e: R & { courses?: string[] }) => ({
      institution: s(e.institution),
      url: s(e.url),
      area: s(e.area),
      studyType: s(e.studyType),
      startDate: s(e.startDate),
      endDate: s(e.endDate),
      score: s(e.score),
      courses: lines(e.courses),
    })),
    awards: (j.awards ?? []).map((a) => ({
      title: s(a.title),
      date: s(a.date),
      awarder: s(a.awarder),
      summary: s(a.summary),
    })),
    certificates: (j.certificates ?? []).map((c) => ({
      name: s(c.name),
      date: s(c.date),
      issuer: s(c.issuer),
      url: s(c.url),
    })),
    publications: (j.publications ?? []).map((p) => ({
      name: s(p.name),
      publisher: s(p.publisher),
      releaseDate: s(p.releaseDate),
      url: s(p.url),
      summary: s(p.summary),
    })),
    skills: (j.skills ?? []).map((k: R & { keywords?: string[] }) => ({
      name: s(k.name),
      level: s(k.level),
      keywords: tags(k.keywords),
    })),
    languages: (j.languages ?? []).map((l) => ({
      language: s(l.language),
      fluency: s(l.fluency),
    })),
    interests: (j.interests ?? []).map((i: R & { keywords?: string[] }) => ({
      name: s(i.name),
      keywords: tags(i.keywords),
    })),
    references: (j.references ?? []).map((r) => ({
      name: s(r.name),
      reference: s(r.reference),
    })),
    projects: (j.projects ?? []).map(
      (p: R & { highlights?: string[]; keywords?: string[]; roles?: string[] }) => ({
        name: s(p.name),
        description: s(p.description),
        url: s(p.url),
        startDate: s(p.startDate),
        endDate: s(p.endDate),
        highlights: lines(p.highlights),
        keywords: tags(p.keywords),
        roles: tags(p.roles),
      }),
    ),
  };
}

export function fromFormModel(values: ResumeFormValues): JsonResume {
  const raw = {
    basics: {
      ...values.basics,
      location: values.basics.location,
      profiles: values.basics.profiles,
    },
    work: values.work.map((w) => ({ ...w, highlights: toLines(w.highlights) })),
    volunteer: values.volunteer.map((w) => ({ ...w, highlights: toLines(w.highlights) })),
    education: values.education.map((e) => ({ ...e, courses: toLines(e.courses) })),
    awards: values.awards,
    certificates: values.certificates,
    publications: values.publications,
    skills: values.skills.map((k) => ({ ...k, keywords: toTags(k.keywords) })),
    languages: values.languages,
    interests: values.interests.map((i) => ({ ...i, keywords: toTags(i.keywords) })),
    references: values.references,
    projects: values.projects.map((p) => ({
      ...p,
      highlights: toLines(p.highlights),
      keywords: toTags(p.keywords),
      roles: toTags(p.roles),
    })),
  };
  // placeholder hygiene: empty strings/arrays/objects vanish entirely
  return (pruneEmpty(raw) ?? {}) as JsonResume;
}

export const EMPTY_FORM: ResumeFormValues = toFormModel({} as JsonResume);

export const EMPTY_ROWS = {
  profile: { network: '', username: '', url: '' },
  work: {
    name: '',
    position: '',
    url: '',
    startDate: '',
    endDate: '',
    summary: '',
    highlights: '',
  },
  volunteer: {
    organization: '',
    position: '',
    url: '',
    startDate: '',
    endDate: '',
    summary: '',
    highlights: '',
  },
  education: {
    institution: '',
    url: '',
    area: '',
    studyType: '',
    startDate: '',
    endDate: '',
    score: '',
    courses: '',
  },
  award: { title: '', date: '', awarder: '', summary: '' },
  certificate: { name: '', date: '', issuer: '', url: '' },
  publication: { name: '', publisher: '', releaseDate: '', url: '', summary: '' },
  skill: { name: '', level: '', keywords: '' },
  language: { language: '', fluency: '' },
  interest: { name: '', keywords: '' },
  reference: { name: '', reference: '' },
  project: {
    name: '',
    description: '',
    url: '',
    startDate: '',
    endDate: '',
    highlights: '',
    keywords: '',
    roles: '',
  },
} as const;
