import { FULL_SAMPLE_RESUME } from '@cvantage/shared';

import type { Types } from '@/api/types';

export const candidateUser: Types.AuthUser = {
  id: '665f1c2ab79e8e3d4c8a9f01',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  role: 'candidate',
  status: 'active',
};

export const adminUser: Types.AuthUser = {
  ...candidateUser,
  id: '665f1c2ab79e8e3d4c8a9f02',
  email: 'admin@example.com',
  fullName: 'Grace Hopper',
  role: 'admin',
};

export const sampleResume: Types.ResumeDetail = {
  id: '665f1c2db79e8e3d4c8a9f05',
  name: 'Backend Resume',
  source: 'created',
  analysisStatus: 'completed',
  analysisCount: 2,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-09T10:00:00.000Z',
  version: 3,
  jsonResume: FULL_SAMPLE_RESUME as Types.ResumeDetail['jsonResume'],
};

export const sampleAnalysis: Types.Analysis = {
  id: '665f400ab79e8e3d4c8aa101',
  resumeId: sampleResume.id,
  name: 'Platform Engineer @ Acme',
  status: 'completed',
  steps: [
    { key: 'compare_resume_jd', status: 'completed' },
    { key: 'generate_suggestions', status: 'completed' },
    { key: 'prepare_interview_questions', status: 'completed' },
  ],
  result: {
    overallScore: 72,
    atsScore: 64,
    projectScore: 58,
    strongPoints: ['Deep NestJS experience'],
    weakPoints: ['No Kubernetes exposure'],
    matchingSkills: ['TypeScript', 'NestJS'],
    skillGaps: ['Kubernetes'],
    suggestions: [
      {
        _id: '665f41ddb79e8e3d4c8aa777',
        group: 'ats_improvement',
        fieldRef: 'basics.label',
        title: 'Mirror the job title',
        description: 'Use the exact phrase from the JD.',
        proposedValue: 'Senior Platform Engineer',
        applied: false,
        dismissed: false,
      },
    ],
    interviewQuestions: [
      { question: 'How would you scale a NestJS API?', suggestedAnswer: 'Profile first...' },
    ],
  },
  tokensUsed: { promptTokens: 5210, completionTokens: 1480, totalTokens: 6690 },
  modelUsed: 'fake/fake-fixture',
  durationMs: 34250,
  createdAt: '2026-06-10T12:00:00.000Z',
};

export const sampleNotification: Types.Notification = {
  id: '665f50aab79e8e3d4c8aa201',
  analysisId: sampleAnalysis.id,
  type: 'analysis_completed',
  title: 'Analysis "Platform Engineer @ Acme" is ready',
  state: 'active',
  createdAt: '2026-06-10T12:01:00.000Z',
};
