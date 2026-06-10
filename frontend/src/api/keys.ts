import type { Types } from './types';

/** Collision-free query keys, one factory per domain (issue #61 / 7.4). */
export const keys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  resumes: {
    all: () => ['resumes'] as const,
    list: (q: Types.ResumeListQuery) => ['resumes', 'list', q] as const,
    detail: (id: string) => ['resumes', 'detail', id] as const,
    stats: () => ['resumes', 'stats'] as const,
  },
  analyses: {
    all: () => ['analyses'] as const,
    list: (q: Types.AnalysisListQuery) => ['analyses', 'list', q] as const,
    detail: (id: string) => ['analyses', 'detail', id] as const,
  },
  notifications: {
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
  },
  admin: {
    stats: () => ['admin', 'stats'] as const,
    users: (q: Types.AdminUserListQuery) => ['admin', 'users', q] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    userResumes: (id: string, page: number) => ['admin', 'user', id, 'resumes', page] as const,
    models: () => ['admin', 'models'] as const,
  },
} as const;
