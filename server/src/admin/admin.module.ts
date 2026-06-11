import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
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

import { AdminModelsController } from './admin-models.controller';
import { AdminModelsService } from './admin-models.service';
import { AdminResumesController } from './admin-resumes.controller';
import { AdminResumesService } from './admin-resumes.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';
import { ModelKeyValidator } from './model-key-validator.service';

/** Admin platform (Phase 6, issues #52-#56). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Resume.name, schema: ResumeSchema },
      { name: Analysis.name, schema: AnalysisSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    AuditModule,
    AuthModule,
    AiModule,
  ],
  controllers: [
    AdminController,
    AdminUsersController,
    AdminResumesController,
    AdminModelsController,
  ],
  providers: [
    AdminStatsService,
    AdminUsersService,
    AdminResumesService,
    AdminModelsService,
    ModelKeyValidator,
  ],
  exports: [AdminStatsService, AdminUsersService, AdminResumesService, AdminModelsService],
})
export class AdminModule {}
