import { http } from '../http';
import type { Types } from '../types';

export const analysesApi = {
  list: (q: Types.AnalysisListQuery) =>
    http.get<Types.Page<Types.Analysis>>('/analyses', { params: q }).then((r) => r.data),
  get: (id: string) => http.get<Types.Analysis>(`/analyses/${id}`).then((r) => r.data),
  create: (input: Types.CreateAnalysisInput) =>
    http.post<Types.Analysis>('/analyses', input).then((r) => r.data),
  retry: (id: string) => http.post<Types.Analysis>(`/analyses/${id}/retry`).then((r) => r.data),
  cancel: (id: string) => http.post<Types.Analysis>(`/analyses/${id}/cancel`).then((r) => r.data),
  applySuggestion: (id: string, sid: string) =>
    http
      .post<{
        outcome: string;
        suggestion: Types.Suggestion;
      }>(`/analyses/${id}/suggestions/${sid}/apply`)
      .then((r) => r.data),
  dismissSuggestion: (id: string, sid: string) =>
    http
      .post<{ id: string; dismissed: boolean }>(`/analyses/${id}/suggestions/${sid}/dismiss`)
      .then((r) => r.data),
};
