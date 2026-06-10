import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Analysis,
  AnalysisSchema,
  Resume,
  ResumeSchema,
  User,
  UserSchema,
} from '../database/schemas';

import { AdminStatsService } from './admin-stats.service';
import { AdminController } from './admin.controller';

/** Admin platform (Phase 6, issues #52-#56). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Resume.name, schema: ResumeSchema },
      { name: Analysis.name, schema: AnalysisSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminStatsService],
  exports: [AdminStatsService],
})
export class AdminModule {}
