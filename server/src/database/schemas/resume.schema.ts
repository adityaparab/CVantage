import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { ALLOWED_RESUME_MIME, ResumeAnalysisStatus, ResumeSource, UploadParseStatus } from './common';
import { JsonResume, JsonResumeSchema } from './json-resume.schema';

@Schema({ _id: false })
export class OriginalFile {
  @Prop({ required: true, trim: true, maxlength: 300 }) fileName!: string;
  @Prop({ type: String, enum: ALLOWED_RESUME_MIME, required: true }) mimeType!: string;
  @Prop({ required: true, min: 1, max: 10 * 1024 * 1024 }) sizeBytes!: number; // 10 MB cap
  /** Object-storage key — raw bytes never live in MongoDB (StorageService, #34). */
  @Prop({ required: true, trim: true }) storageKey!: string;
  @Prop({ trim: true, maxlength: 64 }) sha256?: string; // dedupe / integrity
}
const OriginalFileSchema = SchemaFactory.createForClass(OriginalFile);

@Schema({ _id: false })
export class UploadParse {
  @Prop({ type: String, enum: UploadParseStatus, default: UploadParseStatus.PENDING })
  status!: UploadParseStatus;
  @Prop({ trim: true }) modelUsed?: string;
  @Prop({ type: Date }) startedAt?: Date;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ trim: true, maxlength: 2000 }) error?: string;
}
const UploadParseSchema = SchemaFactory.createForClass(UploadParse);

@Schema({
  collection: 'resumes',
  timestamps: true,
  optimisticConcurrency: true,
})
export class Resume {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  name!: string;

  @Prop({ type: String, enum: ResumeSource, required: true })
  source!: ResumeSource;

  /** Canonical structured resume — json-resume-schema. */
  @Prop({ type: JsonResumeSchema, required: true })
  jsonResume!: JsonResume;

  /* Upload-flow fields (source === 'uploaded') */
  @Prop({ type: OriginalFileSchema }) originalFile?: OriginalFile;
  /** Raw text extracted from the uploaded file — shown beside the edit form. */
  @Prop({ maxlength: 200_000 }) originalText?: string;
  @Prop({ type: UploadParseSchema }) uploadParse?: UploadParse;

  /* Analysis rollup for the dashboard table */
  @Prop({
    type: String,
    enum: ResumeAnalysisStatus,
    default: ResumeAnalysisStatus.UNANALYZED,
  })
  analysisStatus!: ResumeAnalysisStatus;
  @Prop({ type: Date }) lastAnalyzedAt?: Date;
  @Prop({ default: 0, min: 0 }) analysisCount!: number;

  /* Soft delete */
  @Prop({ type: Date, default: null }) deletedAt?: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'User' }) deletedBy?: Types.ObjectId; // user or admin

  @Prop({ default: 1 }) schemaVersion!: number;
}
export type ResumeDocument = HydratedDocument<Resume>;
export const ResumeSchema = SchemaFactory.createForClass(Resume);

// Dashboard listing: a user's live resumes, newest first.
ResumeSchema.index({ userId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
// Resume name unique per user (live docs only) — avoids confusing duplicate rows.
ResumeSchema.index(
  { userId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { deletedAt: null },
  },
);
ResumeSchema.index({ analysisStatus: 1, updatedAt: -1 });

/**
 * Placeholder hygiene: recursively strip empty strings, empty arrays/objects and
 * whitespace-only values from jsonResume so form placeholders are NEVER stored.
 * Mirrored client-side by @cvantage/shared `pruneEmpty` (#31).
 */
export function prune(value: unknown): unknown {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

ResumeSchema.pre('validate', function (this: ResumeDocument) {
  if (this.jsonResume) {
    const pruned = (prune(this.toObject().jsonResume) ?? {}) as JsonResume;
    this.jsonResume = pruned;
    this.markModified('jsonResume');
  }
});
