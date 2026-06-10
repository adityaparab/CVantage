import { http } from '../http';
import type { Types } from '../types';

export const authApi = {
  me: () => http.get<Types.AuthUser>('/users/me').then((r) => r.data),
  login: (input: Types.LoginInput) =>
    http.post<Types.LoginResponse>('/auth/login', input).then((r) => r.data),
  register: (input: Types.RegisterInput) =>
    http.post<Types.AuthUser>('/auth/register', input).then((r) => r.data),
  logout: () => http.post('/auth/logout').then(() => undefined),
  forgotPassword: (email: string) =>
    http.post('/auth/forgot-password', { email }).then(() => undefined),
  verifyEmail: (token: string) => http.post('/auth/verify-email', { token }).then(() => undefined),
  resetPassword: (token: string, password: string) =>
    http.post('/auth/reset-password', { token, password }).then(() => undefined),
};
