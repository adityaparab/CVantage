import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { AnalysisStatus, AnalysisStepKey, StepStatus, SuggestionGroup } from './common';
import { JsonResume, JsonResumeSchema } from './json-resume.schema';

@Schema({ _id: false })
export class AnalysisStep {
  @Prop({ type: String, enum: AnalysisStepKey, required: true }) key!: AnalysisStepKey;
  @Prop({ type: String, enum: StepStatus, default: StepStatus.PENDING }) status!: StepStatus;
  @Prop({ type: Date }) startedAt?: Date;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ trim: true, maxlength: 2000 }) error?: string;
}
const AnalysisStepSchema = SchemaFactory.createForClass(AnalysisStep);

@Schema({ _id: true })
export class Suggestion {
  @Prop({ type: String, enum: SuggestionGroup, required: true }) group!: SuggestionGroup;
  /** json-resume field path the suggestion targets, e.g. "work[0].highlights". */
  @Prop({ required: true, trim: true, maxlength: 200 }) fieldRef!: string;
  @Prop({ required: true, trim: true, maxlength: 300 }) title!: string;
  @Prop({ required: true, trim: true, maxlength: 5000 }) description!: string;
  /** Concrete replacement / addition the UI can apply with one click. */
  @Prop({ trim: true, maxlength: 10_000 }) proposedValue?: string;
  @Prop({ default: false }) applied!: boolean;
  @Prop({ type: Date }) appliedAt?: Date;
  @Prop({ default: false }) dismissed!: boolean;
}
const SuggestionSchema = SchemaFactory.createForClass(Suggestion);

@Schema({ _id: false })
export class InterviewQuestion {
  @Prop({ required: true, trim: true, maxlength: 1000 }) question!: string;
  @Prop({ required: true, trim: true, maxlength: 10_000 }) suggestedAnswer!: string;
}
const InterviewQuestionSchema = SchemaFactory.createForClass(InterviewQuestion);

@Schema({ _id: false })
export class AnalysisResult {
  @Prop({ required: true, min: 0, max: 100 }) overallScore!: number;
  @Prop({ required: true, min: 0, max: 100 }) atsScore!: number;
  @Prop({ min: 0, max: 100 }) projectScore?: number;
  @Prop({ type: [String], default: [] }) strongPoints!: string[];
  @Prop({ type: [String], default: [] }) weakPoints!: string[];
  @Prop({ type: [String], default: [] }) matchingSkills!: string[];
  @Prop({ type: [String], default: [] }) skillGaps!: string[];
  @Prop({ type: [SuggestionSchema], default: [] }) suggestions!: Suggestion[];
  @Prop({ type: [InterviewQuestionSchema], default: [] })
  interviewQuestions!: InterviewQuestion[];
}
const AnalysisResultSchema = SchemaFactory.createForClass(AnalysisResult);

@Schema({
  collection: 'analyses',
  timestamps: true,
  optimisticConcurrency: true,
})
export class Analysis {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Resume', required: true, index: true })
  resumeId!: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  name!: string;

  @Prop({ required: true, trim: true, minlength: 30, maxlength: 50_000 })
  jobDescription!: string;

  /** Immutable snapshot of the resume at analysis time (resume may be edited later). */
  @Prop({ type: JsonResumeSchema, required: true })
  resumeSnapshot!: JsonResume;

  @Prop({ type: String, enum: AnalysisStatus, default: AnalysisStatus.PENDING, index: true })
  status!: AnalysisStatus;

  /** Fixed 3-step pipeline, mirrored in the progress UI. */
  @Prop({
    type: [AnalysisStepSchema],
    default: () =>
      Object.values(AnalysisStepKey).map((key) => ({ key, status: StepStatus.PENDING })),
    validate: [(v: AnalysisStep[]) => v.length === 3, 'Analysis must have exactly 3 steps'],
  })
  steps!: AnalysisStep[];

  @Prop({ type: AnalysisResultSchema }) result?: AnalysisResult;

  @Prop({ trim: true }) modelUsed?: string;
  @Prop({ type: Date }) startedAt?: Date;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ min: 0 }) durationMs?: number;
  @Prop({ trim: true, maxlength: 2000 }) error?: string;
  @Prop({ default: 0, min: 0, max: 5 }) retryCount!: number;

  /* Worker bookkeeping (issue #40 / 4.3) — claim ownership + liveness. */
  @Prop({ trim: true }) claimedBy?: string;
  @Prop({ type: Date }) heartbeatAt?: Date;

  @Prop({ default: 1 }) schemaVersion!: number;
}
export type AnalysisDocument = HydratedDocument<Analysis>;
export const AnalysisSchema = SchemaFactory.createForClass(Analysis);

AnalysisSchema.index({ userId: 1, createdAt: -1 });
AnalysisSchema.index({ resumeId: 1, createdAt: -1 });
// Worker queue scan: pending/in-progress jobs, oldest first.
AnalysisSchema.index(
  { status: 1, createdAt: 1 },
  {
    partialFilterExpression: {
      status: { $in: [AnalysisStatus.PENDING, AnalysisStatus.IN_PROGRESS] },
    },
  },
);
