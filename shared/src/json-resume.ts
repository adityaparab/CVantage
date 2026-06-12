import { z } from 'zod';

/**
 * Canonical json-resume-schema mirror (issue #31 / 3.1).
 * Single source of truth: the server's mongoose schemas import these
 * regexes, the LLM structured output (#42) and the frontend form (#65)
 * validate against these zod schemas. Constraints stay aligned with
 * server/src/database/schemas (same lengths, same patterns).
 */

/** json-resume partial date: "YYYY" | "YYYY-MM" | "YYYY-MM-DD" */
export const JSON_RESUME_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_RE = /^https?:\/\/.+/i;

const partialDate = z
  .string()
  .regex(JSON_RESUME_DATE, 'Date must be YYYY, YYYY-MM or YYYY-MM-DD')
  .optional();
const url = z.string().regex(URL_RE, 'must be an http(s) URL').optional();
const str = (max: number) => z.string().max(max).optional();

export const jrLocationSchema = z
  .object({
    address: str(300),
    postalCode: str(20),
    city: str(120),
    countryCode: z.string().length(2).optional(),
    region: str(120),
  })
  .partial();

export const jrProfileSchema = z
  .object({
    network: str(60),
    username: str(120),
    url,
  })
  .partial();

export const jrBasicsSchema = z
  .object({
    name: str(200).optional(),
    label: str(200).optional(),
    image: url.optional(),
    email: z.string().regex(EMAIL_RE, 'Invalid email').max(320).optional(),
    phone: str(40).optional(),
    url: url.optional(),
    summary: str(5000).optional(),
    location: jrLocationSchema.optional(),
    profiles: z.array(jrProfileSchema).optional(),
  })
  .partial();

export const jrWorkSchema = z
  .object({
    name: str(200),
    location: str(200),
    description: str(1000),
    position: str(200),
    url,
    startDate: partialDate,
    endDate: partialDate,
    summary: str(5000),
    highlights: z.array(z.string().max(2000)).optional(),
  })
  .partial();

export const jrVolunteerSchema = z
  .object({
    organization: str(200),
    position: str(200),
    url,
    startDate: partialDate,
    endDate: partialDate,
    summary: str(5000),
    highlights: z.array(z.string().max(2000)).optional(),
  })
  .partial();

export const jrEducationSchema = z
  .object({
    institution: str(200),
    url,
    area: str(200),
    studyType: str(100),
    startDate: partialDate,
    endDate: partialDate,
    score: str(50),
    courses: z.array(z.string().max(300)).optional(),
  })
  .partial();

export const jrAwardSchema = z
  .object({
    title: str(200),
    date: partialDate,
    awarder: str(200),
    summary: str(2000),
  })
  .partial();

export const jrCertificateSchema = z
  .object({
    name: str(200),
    date: partialDate,
    issuer: str(200),
    url,
  })
  .partial();

export const jrPublicationSchema = z
  .object({
    name: str(300),
    publisher: str(200),
    releaseDate: partialDate,
    url,
    summary: str(2000),
  })
  .partial();

export const jrSkillSchema = z
  .object({
    name: str(120),
    level: str(60),
    keywords: z.array(z.string().max(120)).optional(),
  })
  .partial();

export const jrLanguageSchema = z
  .object({
    language: str(80),
    fluency: str(80),
  })
  .partial();

export const jrInterestSchema = z
  .object({
    name: str(120),
    keywords: z.array(z.string().max(120)).optional(),
  })
  .partial();

export const jrReferenceSchema = z
  .object({
    name: str(200),
    reference: str(3000),
  })
  .partial();

export const jrProjectSchema = z
  .object({
    name: str(200),
    description: str(5000),
    highlights: z.array(z.string().max(2000)).optional(),
    keywords: z.array(z.string().max(120)).optional(),
    startDate: partialDate,
    endDate: partialDate,
    url,
    roles: z.array(z.string().max(120)).optional(),
    entity: str(200),
    type: str(100),
  })
  .partial();

export const jrMetaSchema = z
  .object({
    canonical: url,
    version: str(20),
    lastModified: str(40),
  })
  .partial();

/** Full json-resume document — every section optional per the spec. */
export const jsonResumeSchema = z
  .object({
    basics: jrBasicsSchema.optional(),
    work: z.array(jrWorkSchema).optional(),
    volunteer: z.array(jrVolunteerSchema).optional(),
    education: z.array(jrEducationSchema).optional(),
    awards: z.array(jrAwardSchema).optional(),
    certificates: z.array(jrCertificateSchema).optional(),
    publications: z.array(jrPublicationSchema).optional(),
    skills: z.array(jrSkillSchema).optional(),
    languages: z.array(jrLanguageSchema).optional(),
    interests: z.array(jrInterestSchema).optional(),
    references: z.array(jrReferenceSchema).optional(),
    projects: z.array(jrProjectSchema).optional(),
    meta: jrMetaSchema.optional(),
  })
  .partial();

export type JsonResume = z.infer<typeof jsonResumeSchema>;
export const JSON_RESUME_SECTIONS = Object.keys(jsonResumeSchema.shape) as readonly string[];
