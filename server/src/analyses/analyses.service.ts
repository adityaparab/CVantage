import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppException } from '../common';
import {
  Analysis,
  AnalysisDocument,
  Resume,
  ResumeAnalysisStatus,
  User,
} from '../database/schemas';

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
}
