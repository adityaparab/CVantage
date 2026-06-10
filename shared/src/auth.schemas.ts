import { z } from 'zod';

import { EMAIL_RE } from './json-resume';

/** Auth payload schemas shared by server validation and client forms (#31). */
export const emailSchema = z.string().regex(EMAIL_RE, 'Invalid email').max(320);

export const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a digit');

export const registerSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(200),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
