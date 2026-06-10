import type { JsonResume } from '@cvantage/shared';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common';
import { AuditAction, Resume, ResumeDocument, ResumeSource, UploadParseStatus, User } from '../database/schemas';

export interface ListQuery {
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'name' | 'lastAnalyzedAt' | 'analysisStatus';
  order: 'asc' | 'desc';
}

const LIST_PROJECTION =
  '_id name source analysisStatus analysisCount lastAnalyzedAt createdAt updatedAt';

/**
 * Resume CRUD (issue #32 / 3.2).
 * Every query is scoped { userId, deletedAt: null } — foreign and deleted
 * documents are indistinguishable from missing ones (404, no existence leak).
 */
@Injectable()
export class ResumesService {
  constructor(
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
  ) {}

  private scope(userId: Types.ObjectId, id?: Types.ObjectId): Record<string, unknown> {
    return { ...(id ? { _id: id } : {}), userId, deletedAt: null };
  }

  async create(
    userId: Types.ObjectId,
    input: { name: string; jsonResume: JsonResume },
    source: ResumeSource = ResumeSource.CREATED,
  ): Promise<ResumeDocument> {
    // Duplicate live name → unique collated index → 11000 → 409 (filter #14)
    const doc = await this.resumes.create({ userId, source, ...input });
    await this.users.updateOne({ _id: userId }, { $inc: { resumeCount: 1 } }).exec();
    return doc;
  }

  async list(
    userId: Types.ObjectId,
    q: ListQuery,
  ): Promise<{ items: ResumeDocument[]; total: number; page: number; limit: number }> {
    const filter = this.scope(userId);
    const [items, total] = await Promise.all([
      this.resumes
        .find(filter)
        .select(LIST_PROJECTION)
        .sort({ [q.sortBy]: q.order === 'asc' ? 1 : -1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.resumes.countDocuments(filter).exec(),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async getById(userId: Types.ObjectId, id: Types.ObjectId): Promise<ResumeDocument> {
    const doc = await this.resumes.findOne(this.scope(userId, id)).exec();
    if (!doc) throw new NotFoundException('Resume not found');
    return doc;
  }

  async update(
    userId: Types.ObjectId,
    id: Types.ObjectId,
    input: { name?: string; jsonResume?: JsonResume; version: number },
  ): Promise<ResumeDocument> {
    const doc = await this.getById(userId, id);
    if (doc.__v !== input.version) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Conflict',
        'The resume was modified by another request — reload and retry',
        { conflict: 'version', currentVersion: doc.__v },
      );
    }
    if (input.name !== undefined) doc.name = input.name;
    if (input.jsonResume !== undefined) {
      doc.jsonResume = input.jsonResume as never;
      doc.markModified('jsonResume');
    }
    // optimisticConcurrency: a concurrent save still loses with VersionError → 409
    await doc.save();
    return doc;
  }

  /** Re-enqueue a FAILED upload parse (issue #41 / 4.4). Owner only. */
  async reparse(userId: Types.ObjectId, id: Types.ObjectId): Promise<ResumeDocument> {
    const doc = await this.resumes
      .findOne({ _id: id, userId, deletedAt: null })
      .exec();
    if (!doc) throw new NotFoundException('Resume not found');
    if (doc.uploadParse?.status !== UploadParseStatus.FAILED) {
      throw new AppException(
        409,
        'Conflict',
        'Only failed parses can be retried',
        { currentStatus: doc.uploadParse?.status ?? null },
      );
    }
    await this.resumes
      .updateOne(
        { _id: id, 'uploadParse.status': UploadParseStatus.FAILED },
        {
          $set: { 'uploadParse.status': UploadParseStatus.PENDING, 'uploadParse.retryCount': 0 },
          $unset: {
            'uploadParse.error': 1,
            'uploadParse.claimedBy': 1,
            'uploadParse.heartbeatAt': 1,
            'uploadParse.completedAt': 1,
          },
        },
      )
      .exec();
    return (await this.resumes.findOne({ _id: id, userId, deletedAt: null }).exec())!;
  }

  async softDelete(userId: Types.ObjectId, id: Types.ObjectId): Promise<void> {
    const res = await this.resumes
      .findOneAndUpdate(
        this.scope(userId, id),
        { $set: { deletedAt: new Date(), deletedBy: userId } },
        { new: true },
      )
      .exec();
    if (!res) throw new NotFoundException('Resume not found');
    await this.users
      .updateOne({ _id: userId, resumeCount: { $gt: 0 } }, { $inc: { resumeCount: -1 } })
      .exec();
    await this.audit.record({
      action: AuditAction.RESUME_DELETE,
      actorId: userId,
      targetType: 'resume',
      targetId: id,
    });
  }
}
