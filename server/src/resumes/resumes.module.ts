import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';

import { ExtractionService } from './extraction.service';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [DatabaseModule, AuditModule, AuthModule],
  controllers: [ResumesController, UploadController],
  providers: [ResumesService, UploadService, ExtractionService],
  exports: [ResumesService, UploadService, ExtractionService],
})
export class ResumesModule {}
