import { FULL_SAMPLE_RESUME, MINIMAL_RESUME } from './fixtures';
import { JSON_RESUME_DATE, JSON_RESUME_SECTIONS, jsonResumeSchema } from './json-resume';
import { pruneEmpty } from './prune';

describe('shared json-resume schema (issue #31 / 3.1)', () => {
  it('parses the full sample (every section) and the minimal resume', () => {
    expect(jsonResumeSchema.safeParse(FULL_SAMPLE_RESUME).success).toBe(true);
    expect(jsonResumeSchema.safeParse(MINIMAL_RESUME).success).toBe(true);
    expect(JSON_RESUME_SECTIONS).toHaveLength(13);
  });

  it('parses the official json-resume canonical example shape', () => {
    // Representative subset of github.com/jsonresume/resume-schema sample.json
    const official = {
      basics: {
        name: 'John Doe',
        label: 'Programmer',
        email: 'john@gmail.com',
        phone: '(912) 555-4321',
        url: 'https://johndoe.com',
        summary: 'A summary of John Doe…',
        location: {
          address: '2712 Broadway St',
          postalCode: 'CA 94115',
          city: 'San Francisco',
          countryCode: 'US',
          region: 'California',
        },
        profiles: [{ network: 'Twitter', username: 'john', url: 'https://twitter.com/john' }],
      },
      work: [
        {
          name: 'Company',
          position: 'President',
          url: 'https://company.com',
          startDate: '2013-01-01',
          endDate: '2014-01-01',
          summary: 'Description…',
          highlights: ['Started the company'],
        },
      ],
      education: [
        {
          institution: 'University',
          url: 'https://institution.com/',
          area: 'Software Development',
          studyType: 'Bachelor',
          startDate: '2011-01-01',
          endDate: '2013-01-01',
          score: '4.0',
          courses: ['DB1101 - Basic SQL'],
        },
      ],
      skills: [{ name: 'Web Development', level: 'Master', keywords: ['HTML', 'CSS'] }],
    };
    const parsed = jsonResumeSchema.safeParse(official);
    expect(parsed.success).toBe(true);
  });

  it('partial dates: three valid formats accepted, invalid rejected', () => {
    for (const good of ['2024', '2024-03', '2024-03-01']) {
      expect(good).toMatch(JSON_RESUME_DATE);
      expect(jsonResumeSchema.safeParse({ work: [{ startDate: good }] }).success).toBe(true);
    }
    for (const bad of ['2024-13', '2024-00', '03-2024', '2024-1', 'soon']) {
      expect(jsonResumeSchema.safeParse({ work: [{ startDate: bad }] }).success).toBe(false);
    }
  });

  it('rejects oversized fields and malformed urls/emails', () => {
    expect(jsonResumeSchema.safeParse({ basics: { email: 'not-an-email' } }).success).toBe(false);
    expect(jsonResumeSchema.safeParse({ basics: { url: 'ftp://nope' } }).success).toBe(false);
    expect(jsonResumeSchema.safeParse({ basics: { name: 'x'.repeat(201) } }).success).toBe(false);
  });
});

describe('pruneEmpty (issue #31 / 3.1)', () => {
  it('strips placeholders recursively and is idempotent', () => {
    const messy = {
      basics: { name: 'Ada', summary: '   ', location: { city: '' } },
      work: [
        { name: '', highlights: [] },
        { name: 'Real', highlights: ['kept', ' '] },
      ],
      skills: [],
      meta: {},
    };
    const once = pruneEmpty(messy) as Record<string, unknown>;
    expect(once).toEqual({
      basics: { name: 'Ada' },
      work: [{ name: 'Real', highlights: ['kept'] }],
    });
    expect(pruneEmpty(once)).toEqual(once);
  });

  it('randomized structures never retain empty containers at any depth', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const genValue = (depth: number): unknown => {
      const r = rnd();
      if (depth > 3 || r < 0.25) return r < 0.12 ? '' : '  x  ';
      if (r < 0.5) return Array.from({ length: Math.floor(rnd() * 3) }, () => genValue(depth + 1));
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < Math.floor(rnd() * 4); i++) obj[`k${i}`] = genValue(depth + 1);
      return obj;
    };
    const hasEmpties = (v: unknown): boolean => {
      if (typeof v === 'string') return v.trim() === '';
      if (Array.isArray(v)) return v.length === 0 || v.some(hasEmpties);
      if (v && typeof v === 'object')
        return Object.keys(v).length === 0 || Object.values(v).some(hasEmpties);
      return false;
    };
    for (let i = 0; i < 100; i++) {
      const pruned = pruneEmpty(genValue(0));
      if (pruned !== undefined) {
        expect(hasEmpties(pruned)).toBe(false);
      }
    }
  });

  it('preserves dates, numbers and booleans', () => {
    const d = new Date();
    expect(pruneEmpty({ d, n: 0, b: false })).toEqual({ d, n: 0, b: false });
  });
});
