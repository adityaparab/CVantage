import type { JsonResume } from '@cvantage/shared';

import { http } from '../http';
import type { Types } from '../types';

export const resumesApi = {
  list: (q: Types.ResumeListQuery) =>
    http.get<Types.Page<Types.ResumeListItem>>('/resumes', { params: q }).then((r) => r.data),
  get: (id: string) => http.get<Types.ResumeDetail>(`/resumes/${id}`).then((r) => r.data),
  create: (input: { name: string; jsonResume: JsonResume }) =>
    http.post<Types.ResumeDetail>('/resumes', input).then((r) => r.data),
  update: (id: string, input: { name?: string; jsonResume?: JsonResume; version: number }) =>
    http.patch<Types.ResumeDetail>(`/resumes/${id}`, input).then((r) => r.data),
  remove: (id: string) => http.delete(`/resumes/${id}`).then(() => undefined),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<Types.ResumeDetail>('/resumes/upload', form).then((r) => r.data);
  },
  reparse: (id: string) =>
    http.post<{ id: string; uploadParse: unknown }>(`/resumes/${id}/reparse`).then((r) => r.data),
  stats: () => http.get<Types.UserStats>('/users/me/stats').then((r) => r.data),
};
