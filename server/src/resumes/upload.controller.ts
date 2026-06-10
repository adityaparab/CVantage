import { Controller, HttpStatus, Ip, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { TooManyRequestsException } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators';
import { LockoutService } from '../auth/lockout.service';
import type { RequestUser } from '../auth/request-user';
import { AppException } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { AppConfigService } from '../config';

import { ResumeDetailDto } from './dto/resume.dtos';
import { UploadService } from './upload.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const UPLOAD_RESPONSE_EXAMPLE = {
  id: '665f1c2d3e4f5a6b7c8d9e0f',
  name: 'Ada_Lovelace_CV',
  source: 'uploaded',
  analysisStatus: 'unanalyzed',
  analysisCount: 0,
  createdAt: '2026-06-10T09:00:00.000Z',
  updatedAt: '2026-06-10T09:00:00.000Z',
  version: 1,
  jsonResume: {},
  uploadParse: { status: 'pending' },
};

/** Upload intake (issue #35 / 3.5); AI parsing attaches in #42. */
@ApiTags('resumes')
@ApiBearerAuth('bearer')
@ApiCookieAuth('cvantage.access')
@Controller('resumes')
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly lockout: LockoutService,
    private readonly config: AppConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'multipart/form-data with a single `file` field (.pdf, .doc or .docx, ≤10MB). ' +
      'Extension, declared content type and actual magic bytes must all agree.',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload a resume file',
    description:
      'Stores the original file (object storage — bytes never enter MongoDB), ' +
      'creates the resume (source=uploaded, name derived from the filename with ' +
      'automatic " (2)" dedupe) and queues AI parsing (#42; uploadParse.status ' +
      'starts as pending). Poll GET /resumes/{id} or subscribe to SSE (#48) for ' +
      'parse progress. Spoofed files (e.g. an .exe renamed to .pdf) are rejected ' +
      'with the mismatch named in details.',
  })
  @ApiCreatedResponse({
    description: 'Resume created; parsing queued',
    type: ResumeDetailDto,
    example: UPLOAD_RESPONSE_EXAMPLE,
  })
  @ApiStandardErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.BAD_REQUEST,
    HttpStatus.PAYLOAD_TOO_LARGE,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async uploadResume(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Ip() ip: string,
  ): Promise<ResumeDetailDto> {
    const gate = this.lockout.hit(
      'upload',
      user.id,
      ip ?? 'unknown',
      this.config.throttle.uploadLimit,
    );
    if (gate.blocked) throw new TooManyRequestsException(gate.retryAfterS);

    if (!file) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation Failed',
        'multipart field "file" is required',
      );
    }

    const doc = await this.upload.ingest(new Types.ObjectId(user.id), file);
    return {
      id: String(doc._id),
      name: doc.name,
      source: doc.source,
      analysisStatus: doc.analysisStatus,
      analysisCount: doc.analysisCount,
      lastAnalyzedAt: doc.lastAnalyzedAt?.toISOString(),
      createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
      version: doc.__v as number,
      jsonResume: doc.jsonResume,
      originalText: doc.originalText,
      uploadParse: doc.uploadParse,
    };
  }
}
