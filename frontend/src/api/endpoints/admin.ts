import { http } from '../http';
import type { Types } from '../types';

export const adminApi = {
  stats: () => http.get<Types.AdminStats>('/admin/stats').then((r) => r.data),
  users: (q: Types.AdminUserListQuery) =>
    http.get<Types.Page<Types.AdminUserRow>>('/admin/users', { params: q }).then((r) => r.data),
  user: (id: string) => http.get<Types.AdminUserRow>(`/admin/users/${id}`).then((r) => r.data),
  updateUser: (id: string, patch: { fullName?: string; email?: string }) =>
    http.patch<Types.AdminUserRow>(`/admin/users/${id}`, patch).then((r) => r.data),
  resetPassword: (id: string, mode: 'temporary' | 'email') =>
    http
      .post<{ mode: string; temporaryPassword?: string }>(`/admin/users/${id}/reset-password`, {
        mode,
      })
      .then((r) => r.data),
  deactivate: (id: string) =>
    http.post<{ id: string; status: string }>(`/admin/users/${id}/deactivate`).then((r) => r.data),
  reactivate: (id: string) =>
    http.post<{ id: string; status: string }>(`/admin/users/${id}/reactivate`).then((r) => r.data),
  userResumes: (id: string, page = 1) =>
    http
      .get<Types.Page<Types.AdminResumeRow>>(`/admin/users/${id}/resumes`, { params: { page } })
      .then((r) => r.data),
  deleteResume: (id: string) =>
    http
      .delete<{ resumeDeleted: boolean; analysesDeleted: number }>(`/admin/resumes/${id}`)
      .then((r) => r.data),
  models: () => http.get<Types.AdminModel[]>('/admin/models').then((r) => r.data),
  addModel: (input: { provider: string; modelName: string; apiKey: string; usages: string[] }) =>
    http.post<Types.AdminModel>('/admin/models', input).then((r) => r.data),
  patchModel: (id: string, patch: { status?: string; usages?: string[] }) =>
    http.patch<Types.AdminModel>(`/admin/models/${id}`, patch).then((r) => r.data),
  rotateModelKey: (id: string, apiKey: string) =>
    http.post<Types.AdminModel>(`/admin/models/${id}/rotate-key`, { apiKey }).then((r) => r.data),
  removeModel: (id: string) => http.delete(`/admin/models/${id}`).then(() => undefined),
};
