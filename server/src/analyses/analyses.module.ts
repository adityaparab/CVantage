import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../ai/ai.module';
import {
  Analysis,
  AnalysisSchema,
  Resume,
  ResumeSchema,
  User,
  UserSchema,
} from '../database/schemas';
import { JobsModule } from '../jobs';
import { NotificationsModule } from '../notifications/notifications.module';

import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisPipelineService } from './analysis-pipeline.service';

/** Analysis domain (issue #42 / 4.5). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Analysis.name, schema: AnalysisSchema },
      { name: Resume.name, schema: ResumeSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AiModule,
    JobsModule,
    NotificationsModule,
  ],
  controllers: [AnalysesController],
  providers: [AnalysesService, AnalysisPipelineService],
  exports: [AnalysesService],
})
export class AnalysesModule {}
