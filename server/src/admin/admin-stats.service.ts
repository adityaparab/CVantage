import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppConfigService } from '../config';
import { Analysis, Resume, User } from '../database/schemas';

export interface AdminStats {
  users: number;
  resumes: number;
  analyses: number;
  generatedAt: string;
}

/**
 * Dashboard stats (issue #52 / 6.1): three countDocuments behind a small
 * in-memory cache (ADMIN_STATS_CACHE_S, default 60s) so an admin staring at
 * the dashboard never hammers the collections.
 */
@Injectable()
export class AdminStatsService {
  private cache?: { value: AdminStats; expiresAt: number };

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    @InjectModel(Analysis.name) private readonly analyses: Model<Analysis>,
    private readonly config: AppConfigService,
  ) {}

  async stats(): Promise<AdminStats> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const [users, resumes, analyses] = await Promise.all([
      this.users.countDocuments({}).exec(),
      this.resumes.countDocuments({ deletedAt: null }).exec(), // live only
      this.analyses.countDocuments({}).exec(), // all-time
    ]);
    const value: AdminStats = {
      users,
      resumes,
      analyses,
      generatedAt: new Date().toISOString(),
    };
    this.cache = {
      value,
      expiresAt: Date.now() + this.config.admin.statsCacheSeconds * 1000,
    };
    return value;
  }
}
