import { http } from '../http';
import type { Types } from '../types';

export const notificationsApi = {
  list: () => http.get<Types.Page<Types.Notification>>('/notifications').then((r) => r.data),
  clear: (id: string) =>
    http.post<{ id: string; state: string }>(`/notifications/${id}/clear`).then((r) => r.data),
};
