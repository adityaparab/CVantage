import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { JobsModule } from '../jobs';

import { ExtractionService } from './extraction.service';
import { ParsePipelineService } from './parse-pipeline.service';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [DatabaseModule, AuditModule, AuthModule, AiModule, JobsModule],
  controllers: [ResumesController, UploadController],
  providers: [ResumesService, UploadService, ExtractionService, ParsePipelineService],
  exports: [ResumesService, UploadService, ExtractionService],
})
export class ResumesModule {}
