import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppException } from '../common';
import {
  Analysis,
  AnalysisDocument,
  AnalysisStatus,
  Resume,
  ResumeAnalysisStatus,
  StepStatus,
  User,
} from '../database/schemas';

import { applyAtFieldRef } from './field-ref';

export interface CreateAnalysisInput {
  name: string;
  jobDescription: string;
  resumeId: Types.ObjectId;
}

/**
 * Analysis domain service (issue #42 / 4.5). Creation snapshots the resume
 * (later edits never bleed into a running analysis) and relies on the
 * schema-enforced 3-step skeleton. The pending row IS the queue entry (#40).
 */
@Injectable()
export class AnalysesService {
  constructor(
    @InjectModel(Analysis.name) private readonly analyses: Model<Analysis>,
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async create(userId: Types.ObjectId, input: CreateAnalysisInput): Promise<AnalysisDocument> {
    const resume = await this.resumes
      .findOne({ _id: input.resumeId, userId, deletedAt: null })
      .exec();
    if (!resume) throw new NotFoundException('Resume not found');
    const snapshot = resume.toObject().jsonResume as Record<string, unknown>;
    if (!snapshot || Object.keys(snapshot).length === 0) {
      throw new AppException(
        422,
        'Unprocessable Entity',
        'Resume has no content to analyze yet - fill it in or wait for parsing to finish',
        { resumeId: String(input.resumeId) },
      );
    }
    const doc = await this.analyses.create({
      userId,
      resumeId: input.resumeId,
      name: input.name,
      jobDescription: input.jobDescription,
      resumeSnapshot: snapshot,
    });
    await Promise.all([
      this.resumes
        .updateOne(
          { _id: resume._id },
          { $set: { analysisStatus: ResumeAnalysisStatus.IN_PROGRESS } },
        )
        .exec(),
      this.users.updateOne({ _id: userId }, { $inc: { analysisCount: 1 } }).exec(),
      this.resumes.updateOne({ _id: resume._id }, { $inc: { analysisCount: 1 } }).exec(),
    ]);
    return doc;
  }

  async getById(userId: Types.ObjectId, id: Types.ObjectId): Promise<AnalysisDocument> {
    const doc = await this.analyses.findOne({ _id: id, userId }).exec();
    if (!doc) throw new NotFoundException('Analysis not found');
    return doc;
  }

  async list(
    userId: Types.ObjectId,
    q: { page: number; limit: number; resumeId?: Types.ObjectId; status?: AnalysisStatus },
  ): Promise<{ items: AnalysisDocument[]; total: number }> {
    const filter: Record<string, unknown> = { userId };
    if (q.resumeId) filter.resumeId = q.resumeId;
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      this.analyses
        .find(filter)
        .select('-jobDescription -resumeSnapshot -result.suggestions -result.interviewQuestions')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.analyses.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /** Retry a FAILED analysis: reset failed steps, re-enqueue (issue #43). */
  async retry(userId: Types.ObjectId, id: Types.ObjectId): Promise<AnalysisDocument> {
    const doc = await this.getById(userId, id);
    if (doc.status !== AnalysisStatus.FAILED) {
      throw new AppException(409, 'Conflict', 'Only failed analyses can be retried', {
        currentStatus: doc.status,
      });
    }
    await this.analyses
      .updateOne(
        { _id: id, status: AnalysisStatus.FAILED },
        {
          $set: {
            status: AnalysisStatus.PENDING,
            retryCount: 0,
            'steps.$[f].status': StepStatus.PENDING,
          },
          $unset: { error: 1, claimedBy: 1, heartbeatAt: 1, completedAt: 1, durationMs: 1 },
        },
        { arrayFilters: [{ 'f.status': StepStatus.FAILED }] },
      )
      .exec();
    await this.resumes
      .updateOne(
        { _id: doc.resumeId },
        { $set: { analysisStatus: ResumeAnalysisStatus.IN_PROGRESS } },
      )
      .exec();
    return this.getById(userId, id);
  }

  /** Cancel a PENDING analysis (issue #43). */
  async cancel(userId: Types.ObjectId, id: Types.ObjectId): Promise<AnalysisDocument> {
    const doc = await this.getById(userId, id);
    if (doc.status !== AnalysisStatus.PENDING) {
      throw new AppException(409, 'Conflict', 'Only pending analyses can be cancelled', {
        currentStatus: doc.status,
      });
    }
    const flipped = await this.analyses
      .updateOne(
        { _id: id, status: AnalysisStatus.PENDING },
        { $set: { status: AnalysisStatus.CANCELLED, completedAt: new Date() } },
      )
      .exec();
    if (flipped.modifiedCount === 0) {
      // raced the runner — it claimed first
      throw new AppException(409, 'Conflict', 'Analysis already started', {
        currentStatus: AnalysisStatus.IN_PROGRESS,
      });
    }
    const resume = await this.resumes.findOne({ _id: doc.resumeId }).exec();
    await this.resumes
      .updateOne(
        { _id: doc.resumeId },
        {
          $set: {
            analysisStatus: resume?.lastAnalyzedAt
              ? ResumeAnalysisStatus.COMPLETED
              : ResumeAnalysisStatus.UNANALYZED,
          },
        },
      )
      .exec();
    return this.getById(userId, id);
  }

  /** Apply a suggestion's proposedValue to the LIVE resume (issue #43). */
  async applySuggestion(
    userId: Types.ObjectId,
    analysisId: Types.ObjectId,
    suggestionId: Types.ObjectId,
  ): Promise<{ analysis: AnalysisDocument; outcome: 'applied' | 'already_applied' }> {
    const analysis = await this.getById(userId, analysisId);
    const suggestion = (analysis.result?.suggestions ?? []).find(
      (s) => String((s as unknown as { _id: Types.ObjectId })._id) === String(suggestionId),
    );
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.applied) return { analysis, outcome: 'already_applied' }; // idempotent
    if (!suggestion.proposedValue) {
      throw new AppException(
        422,
        'Unprocessable Entity',
        'This suggestion has no concrete proposed value - apply it manually in the editor',
        { suggestionId: String(suggestionId) },
      );
    }
    const resume = await this.resumes
      .findOne({ _id: analysis.resumeId, userId, deletedAt: null })
      .exec();
    if (!resume) {
      throw new AppException(410, 'Gone', 'The resume this analysis belongs to was deleted', {
        resumeId: String(analysis.resumeId),
      });
    }
    const json = resume.toObject().jsonResume as Record<string, unknown>;
    try {
      applyAtFieldRef(json, suggestion.fieldRef, suggestion.proposedValue);
    } catch (err) {
      throw new AppException(
        422,
        'Unprocessable Entity',
        err instanceof Error ? err.message : 'Could not apply the suggestion',
        { fieldRef: suggestion.fieldRef },
      );
    }
    resume.jsonResume = json as never;
    resume.markModified('jsonResume');
    await resume.save(); // optimistic concurrency -> VersionError -> 409 (filter)
    await this.analyses
      .updateOne(
        { _id: analysisId },
        {
          $set: {
            'result.suggestions.$[s].applied': true,
            'result.suggestions.$[s].appliedAt': new Date(),
          },
        },
        { arrayFilters: [{ 's._id': suggestionId }] },
      )
      .exec();
    return { analysis: await this.getById(userId, analysisId), outcome: 'applied' };
  }

  /** Dismiss a suggestion (idempotent; issue #43). */
  async dismissSuggestion(
    userId: Types.ObjectId,
    analysisId: Types.ObjectId,
    suggestionId: Types.ObjectId,
  ): Promise<AnalysisDocument> {
    const analysis = await this.getById(userId, analysisId);
    const exists = (analysis.result?.suggestions ?? []).some(
      (s) => String((s as unknown as { _id: Types.ObjectId })._id) === String(suggestionId),
    );
    if (!exists) throw new NotFoundException('Suggestion not found');
    await this.analyses
      .updateOne(
        { _id: analysisId },
        { $set: { 'result.suggestions.$[s].dismissed': true } },
        { arrayFilters: [{ 's._id': suggestionId }] },
      )
      .exec();
    return this.getById(userId, analysisId);
  }
}
