import { Types } from 'mongoose';

import {
  AnalysisStatus,
  AnalysisStepKey,
  ResumeSource,
  StepStatus,
  UserRole,
  UserStatus,
} from '../src/database/schemas';

/** Deterministic-ish data factories for tests (issue #19 / 1.10). */
let seq = 0;
const n = (): number => ++seq;

export const buildUser = (overrides: Record<string, unknown> = {}) => ({
  email: `user${n()}@example.test`,
  fullName: `Test User ${seq}`,
  role: UserRole.CANDIDATE,
  status: UserStatus.ACTIVE,
  emailVerified: true,
  ...overrides,
});

export const buildJsonResume = (overrides: Record<string, unknown> = {}) => ({
  basics: {
    name: 'Ada Lovelace',
    label: 'Software Engineer',
    email: 'ada@example.test',
    summary: 'Engineer with strong analytical background.',
  },
  work: [
    {
      name: 'Analytical Engines Ltd',
      position: 'Senior Engineer',
      startDate: '2021-03',
      highlights: ['Designed the difference engine pipeline'],
    },
  ],
  skills: [{ name: 'TypeScript', keywords: ['node', 'nest'] }],
  ...overrides,
});

export const buildResume = (userId: Types.ObjectId, overrides: Record<string, unknown> = {}) => ({
  userId,
  name: `Resume ${n()}`,
  source: ResumeSource.CREATED,
  jsonResume: buildJsonResume(),
  ...overrides,
});

export const buildAnalysis = (
  userId: Types.ObjectId,
  resumeId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) => ({
  userId,
  resumeId,
  name: `Analysis ${n()}`,
  jobDescription:
    'We are seeking a senior TypeScript engineer with NestJS and MongoDB experience to build AI products.',
  resumeSnapshot: buildJsonResume(),
  status: AnalysisStatus.PENDING,
  steps: Object.values(AnalysisStepKey).map((key) => ({ key, status: StepStatus.PENDING })),
  ...overrides,
});
