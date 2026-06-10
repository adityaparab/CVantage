import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuditService } from '../audit/audit.service';
import {
  Analysis,
  AuditAction,
  Notification,
  NotificationState,
  Resume,
  ResumeDocument,
  User,
} from '../database/schemas';

/**
 * Admin resume oversight (issue #54 / 6.3). The privacy boundary is
 * STRUCTURAL: this service only ever projects metadata - jsonResume,
 * originalText and analysis results are unselectable here by construction.
 * Deletion cascades in ordered, idempotent steps (decision D15 - re-runnable
 * without transactions).
 */
@Injectable()
export class AdminResumesService {
  constructor(
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    @InjectModel(Analysis.name) private readonly analyses: Model<Analysis>,
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
  ) {}

  /** Metadata-only listing of a user's live resumes. */
  async listForUser(
    userId: Types.ObjectId,
    q: { page: number; limit: number },
  ): Promise<{ items: ResumeDocument[]; total: number }> {
    const filter = { userId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.resumes
        .find(filter)
        .select('name source createdAt analysisCount analysisStatus') // whitelist
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.resumes.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /**
   * Cascade delete, ordered + idempotent:
   *  1. soft-delete the resume        (guarded: only if currently live)
   *  2. soft-delete its analyses      (guarded per-doc; count -> counter dec)
   *  3. clear their active notifications
   *  4. decrement user counters       (only for what steps 1-2 changed)
   * A crash between steps re-runs cleanly: every step only touches docs not
   * yet in their target state, so nothing double-decrements.
   */
  async cascadeDelete(
    actorId: Types.ObjectId,
    resumeId: Types.ObjectId,
  ): Promise<{
    resumeDeleted: boolean;
    analysesDeleted: number;
    notificationsCleared: number;
  }> {
    const resume = await this.resumes.findById(resumeId).exec();
    if (!resume) throw new NotFoundException('Resume not found');
    const now = new Date();

    const del = await this.resumes
      .updateOne(
        { _id: resumeId, deletedAt: null },
        { $set: { deletedAt: now, deletedBy: actorId } },
      )
      .exec();
    const resumeDeleted = del.modifiedCount === 1;

    const cascading = await this.analyses
      .updateMany({ resumeId, deletedAt: null }, { $set: { deletedAt: now, deletedBy: actorId } })
      .exec();

    const analysisIds = await this.analyses.find({ resumeId }).select('_id').lean().exec();
    const cleared = await this.notifications
      .updateMany(
        { analysisId: { $in: analysisIds.map((a) => a._id) }, state: NotificationState.ACTIVE },
        { $set: { state: NotificationState.CLEARED, clearedAt: now } },
      )
      .exec();

    if (resumeDeleted) {
      await this.users
        .updateOne({ _id: resume.userId, resumeCount: { $gt: 0 } }, { $inc: { resumeCount: -1 } })
        .exec();
    }
    if (cascading.modifiedCount > 0) {
      await this.users
        .updateOne(
          { _id: resume.userId, analysisCount: { $gte: cascading.modifiedCount } },
          { $inc: { analysisCount: -cascading.modifiedCount } },
        )
        .exec();
    }

    await this.audit.record({
      action: AuditAction.ADMIN_RESUME_DELETE,
      actorId,
      targetType: 'resume',
      targetId: resumeId,
      meta: {
        ownerId: String(resume.userId),
        analysesDeleted: cascading.modifiedCount,
        notificationsCleared: cleared.modifiedCount,
      }, // ids and counts only - never content
    });

    return {
      resumeDeleted,
      analysesDeleted: cascading.modifiedCount,
      notificationsCleared: cleared.modifiedCount,
    };
  }
}
