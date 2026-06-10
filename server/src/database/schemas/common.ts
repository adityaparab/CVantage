import type { PropOptions } from '@nestjs/mongoose';

/**
 * Shared enums, regexes and helpers for the CVantage data model.
 * Ported verbatim from database/nestjs-mongoose/schemas.ts (issue #12 / 1.3) —
 * the canonical reference. Do not change semantics here without updating
 * the reference file and the shared zod schemas (#31).
 */

export enum UserRole {
  CANDIDATE = 'candidate',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  DEACTIVATED = 'deactivated',
}

export enum OAuthProvider {
  GOOGLE = 'google',
  LINKEDIN = 'linkedin',
}

export enum ResumeSource {
  CREATED = 'created', // built with the in-app form
  UPLOADED = 'uploaded', // file upload → AI-parsed
}

export enum ResumeAnalysisStatus {
  UNANALYZED = 'unanalyzed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum UploadParseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AnalysisStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AnalysisStepKey {
  COMPARE = 'compare_resume_jd',
  SUGGESTIONS = 'generate_suggestions',
  INTERVIEW_QUESTIONS = 'prepare_interview_questions',
}

export enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum NotificationType {
  ANALYSIS_IN_PROGRESS = 'analysis_in_progress',
  ANALYSIS_COMPLETED = 'analysis_completed',
  ANALYSIS_FAILED = 'analysis_failed',
}

export enum NotificationState {
  ACTIVE = 'active', // shown in the bell
  CLEARED = 'cleared', // visited details page or cleared manually
}

export enum AiModelUsage {
  RESUME_PARSING = 'resume_parsing',
  ANALYSIS = 'analysis',
  FALLBACK = 'fallback',
}

export enum AiModelStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum TokenKind {
  REFRESH = 'refresh',
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFY = 'email_verify',
}

export enum SuggestionGroup {
  ATS = 'ats_improvement',
  SKILL_EMPHASIS = 'skill_emphasis',
  WORDING = 'wording',
  SKILL_ADDITION = 'skill_addition',
  PROJECT = 'project',
}

export enum AuditAction {
  USER_LOGIN = 'user.login',
  USER_REGISTER = 'user.register',
  ADMIN_USER_UPDATE = 'admin.user.update',
  ADMIN_USER_DEACTIVATE = 'admin.user.deactivate',
  ADMIN_PASSWORD_RESET = 'admin.user.password_reset',
  ADMIN_RESUME_DELETE = 'admin.resume.delete',
  ADMIN_MODEL_ADD = 'admin.model.add',
  ADMIN_MODEL_REMOVE = 'admin.model.remove',
  ADMIN_MODEL_KEY_ROTATE = 'admin.model.key_rotate',
  RESUME_DELETE = 'resume.delete',
  AUTH_REFRESH_REUSE = 'auth.refresh_reuse',
}

/** json-resume partial date: "YYYY" | "YYYY-MM" | "YYYY-MM-DD" */
export const JSON_RESUME_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_RE = /^https?:\/\/.+/i;

export const dateProp: PropOptions<string> = {
  type: String,
  match: [JSON_RESUME_DATE, 'Date must be YYYY, YYYY-MM or YYYY-MM-DD'],
  trim: true,
};

export const ALLOWED_RESUME_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
