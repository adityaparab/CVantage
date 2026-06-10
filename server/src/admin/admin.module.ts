import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Analysis,
  AnalysisSchema,
  Resume,
  ResumeSchema,
  User,
  UserSchema,
} from '../database/schemas';

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
    ]),
    AuthModule,
  ],
  controllers: [AdminController, AdminUsersController],
  providers: [AdminStatsService, AdminUsersService],
  exports: [AdminStatsService, AdminUsersService],
})
export class AdminModule {}
