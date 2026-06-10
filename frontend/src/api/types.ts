import type { JsonResume } from '@cvantage/shared';

/* eslint-disable @typescript-eslint/no-namespace -- a namespace keeps the
   wire DTOs greppable as Types.X everywhere without 30 import lines */
/** Wire DTOs for the CVantage API (issue #61 / 7.4). MSW handlers (#63)
 *  type-check against these, so drift from the server is a compile error. */
export namespace Types {
  export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: 'candidate' | 'admin';
    status: 'active' | 'deactivated';
    emailVerified?: boolean;
  }

  export interface LoginInput {
    email: string;
    password: string;
  }

  export interface RegisterInput extends LoginInput {
    fullName: string;
  }

  export interface LoginResponse {
    accessToken: string;
    user: AuthUser;
  }

  export type UploadParseStatus = 'pending' | 'processing' | 'completed' | 'failed';
  export type AnalysisStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  export type ResumeAnalysisStatus = 'unanalyzed' | 'in_progress' | 'completed' | 'failed';

  export interface ResumeListItem {
    id: string;
    name: string;
    source: 'created' | 'uploaded';
    analysisStatus: ResumeAnalysisStatus;
    analysisCount: number;
    lastAnalyzedAt?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ResumeDetail extends ResumeListItem {
    version: number;
    jsonResume: JsonResume;
    originalText?: string;
    uploadParse?: {
      status: UploadParseStatus;
      modelUsed?: string;
      error?: string;
    };
  }

  export interface ResumeListQuery {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'name' | 'lastAnalyzedAt' | 'analysisStatus';
    order?: 'asc' | 'desc';
  }

  export interface Page<T> {
    items: T[];
    total: number;
  }

  export interface UserStats {
    resumeCount: number;
    analysisCount: number;
  }

  export interface AnalysisStep {
    key: 'compare_resume_jd' | 'generate_suggestions' | 'prepare_interview_questions';
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }

  export interface Suggestion {
    _id: string;
    group: string;
    fieldRef: string;
    title: string;
    description: string;
    proposedValue?: string;
    applied: boolean;
    dismissed: boolean;
  }

  export interface AnalysisResult {
    overallScore: number;
    atsScore: number;
    projectScore?: number;
    strongPoints: string[];
    weakPoints: string[];
    matchingSkills: string[];
    skillGaps: string[];
    suggestions: Suggestion[];
    interviewQuestions: Array<{ question: string; suggestedAnswer: string }>;
  }

  export interface Analysis {
    id: string;
    resumeId: string;
    name: string;
    status: AnalysisStatus;
    steps: AnalysisStep[];
    result?: Partial<AnalysisResult>;
    tokensUsed?: { promptTokens: number; completionTokens: number; totalTokens: number };
    modelUsed?: string;
    error?: string;
    durationMs?: number;
    createdAt: string;
  }

  export interface AnalysisListQuery {
    page?: number;
    limit?: number;
    resumeId?: string;
    status?: AnalysisStatus;
  }

  export interface CreateAnalysisInput {
    name: string;
    jobDescription: string;
    resumeId: string;
  }

  export interface Notification {
    id: string;
    analysisId: string;
    type: 'analysis_in_progress' | 'analysis_completed' | 'analysis_failed';
    title: string;
    body?: string;
    state: 'active' | 'cleared';
    createdAt: string;
  }

  export interface AdminStats {
    users: number;
    resumes: number;
    analyses: number;
    generatedAt: string;
  }

  export interface AdminUserRow {
    id: string;
    fullName: string;
    email: string;
    role: 'candidate' | 'admin';
    status: 'active' | 'deactivated';
    createdAt: string;
    lastActiveAt?: string;
    resumeCount: number;
    analysisCount: number;
  }

  export interface AdminUserListQuery {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: 'createdAt' | 'lastActiveAt' | 'fullName' | 'email' | 'resumeCount' | 'analysisCount';
    order?: 'asc' | 'desc';
  }

  export interface AdminResumeRow {
    id: string;
    name: string;
    source: 'created' | 'uploaded';
    createdAt: string;
    analysisCount: number;
    analysisStatus: ResumeAnalysisStatus;
  }

  export interface AdminModel {
    id: string;
    provider: string;
    modelName: string;
    apiKeyMasked: string;
    usages: Array<'resume_parsing' | 'analysis' | 'fallback'>;
    status: 'active' | 'disabled';
    lastUsedAt?: string;
    createdAt?: string;
  }
}
