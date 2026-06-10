import type { JsonResume } from './json-resume';

/** Complete sample exercising every section (#31) — used by tests, Swagger
 *  examples and the fake LLM provider (#40). */
export const FULL_SAMPLE_RESUME: JsonResume = {
  basics: {
    name: 'Ada Lovelace',
    label: 'Senior Software Engineer',
    email: 'ada@example.com',
    phone: '+44 20 7946 0958',
    url: 'https://adalovelace.dev',
    summary:
      'Engineer with a decade of experience across analytical engines and modern web platforms.',
    location: { city: 'London', countryCode: 'GB', region: 'Greater London' },
    profiles: [{ network: 'GitHub', username: 'ada', url: 'https://github.com/ada' }],
  },
  work: [
    {
      name: 'Analytical Engines Ltd',
      position: 'Senior Engineer',
      location: 'London',
      url: 'https://engines.example',
      startDate: '2021-03',
      summary: 'Leads the computation pipeline team.',
      highlights: ['Designed the difference engine pipeline', 'Cut compute costs 40%'],
    },
    {
      name: 'Babbage & Co',
      position: 'Engineer',
      startDate: '2017',
      endDate: '2021-02',
      highlights: ['Shipped the first punch-card CI system'],
    },
  ],
  volunteer: [
    {
      organization: 'Code for Kids',
      position: 'Mentor',
      startDate: '2019-06',
      summary: 'Teaches programming fundamentals.',
      highlights: ['Mentored 30 students'],
    },
  ],
  education: [
    {
      institution: 'University of London',
      area: 'Mathematics',
      studyType: 'BSc',
      startDate: '2012',
      endDate: '2015',
      score: 'First Class',
      courses: ['Numerical Analysis', 'Logic'],
    },
  ],
  awards: [
    { title: 'Engineer of the Year', date: '2023', awarder: 'Tech Guild', summary: 'Top award.' },
  ],
  certificates: [
    { name: 'AWS Solutions Architect', date: '2022-08', issuer: 'AWS', url: 'https://aws.example' },
  ],
  publications: [
    {
      name: 'Notes on the Analytical Engine',
      publisher: 'Science Press',
      releaseDate: '2020-01',
      url: 'https://pubs.example/notes',
      summary: 'Foundational notes.',
    },
  ],
  skills: [
    { name: 'TypeScript', level: 'Expert', keywords: ['node', 'nest', 'react'] },
    { name: 'MongoDB', level: 'Advanced', keywords: ['aggregation', 'indexing'] },
  ],
  languages: [
    { language: 'English', fluency: 'Native' },
    { language: 'French', fluency: 'Professional' },
  ],
  interests: [{ name: 'Mechanical computing', keywords: ['history', 'engines'] }],
  references: [{ name: 'Charles Babbage', reference: 'Ada is exceptional.' }],
  projects: [
    {
      name: 'CVantage',
      description: 'AI resume analysis platform.',
      highlights: ['Built the analysis pipeline'],
      keywords: ['ai', 'nestjs'],
      startDate: '2026-01',
      url: 'https://github.com/adityaparab/CVantage',
      roles: ['Lead'],
      entity: 'Open Source',
      type: 'application',
    },
  ],
  meta: { canonical: 'https://adalovelace.dev/resume.json', version: 'v1.0.0' },
};

export const MINIMAL_RESUME: JsonResume = {
  basics: { name: 'Min Example', email: 'min@example.com' },
};
