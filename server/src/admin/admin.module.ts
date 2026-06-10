import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Analysis,
  AnalysisSchema,
  Notification,
  NotificationSchema,
  Resume,
  ResumeSchema,
  User,
  UserSchema,
} from '../database/schemas';

import { AdminResumesController } from './admin-resumes.controller';
import { AdminResumesService } from './admin-resumes.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

/** Admin platform (Phase 6, issues #52-#56). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Resume.name, schema: ResumeSchema },
      { name: Analysis.name, schema: AnalysisSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    AuthModule,
  ],
  controllers: [AdminController, AdminUsersController, AdminResumesController],
  providers: [AdminStatsService, AdminUsersService, AdminResumesService],
  exports: [AdminStatsService, AdminUsersService, AdminResumesService],
})
export class AdminModule {}
