import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { CurrentUser } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { ApiPagination } from '../common/docs/api-pagination.decorator';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import type { ResumeDocument } from '../database/schemas';

import {
  CreateResumeDto,
  ListResumesDto,
  RESUME_DETAIL_EXAMPLE,
  RESUME_SORT_FIELDS,
  ResumeDetailDto,
  ResumeListDto,
  ResumeListItemDto,
  UpdateResumeDto,
} from './dto/resume.dtos';
import { ResumesService } from './resumes.service';

const toListItem = (doc: ResumeDocument): ResumeListItemDto => ({
  id: String(doc._id),
  name: doc.name,
  source: doc.source,
  analysisStatus: doc.analysisStatus,
  analysisCount: doc.analysisCount,
  lastAnalyzedAt: doc.lastAnalyzedAt?.toISOString(),
  createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
  updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
});

const toDetail = (doc: ResumeDocument): ResumeDetailDto => ({
  ...toListItem(doc),
  version: doc.__v as number,
  jsonResume: doc.jsonResume,
  originalText: doc.originalText,
  uploadParse: doc.uploadParse,
});

/** Candidate resume CRUD (issue #32 / 3.2). */
@ApiTags('resumes')
@ApiBearerAuth('bearer')
@ApiCookieAuth('cvantage.access')
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a resume from the editor',
    description:
      'Stores a form-built json-resume document (source=created). Placeholder/' +
      'empty fields are pruned server-side and never stored. Resume names are ' +
      'unique per user among live resumes (case-insensitive).',
  })
  @ApiCreatedResponse({
    description: 'Created resume',
    type: ResumeDetailDto,
    example: RESUME_DETAIL_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateResumeDto,
  ): Promise<ResumeDetailDto> {
    const doc = await this.resumes.create(
      new Types.ObjectId(user.id),
      body as Required<CreateResumeDto>,
    );
    return toDetail(doc);
  }

  @Get()
  @ApiOperation({
    summary: 'List my resumes (dashboard table)',
    description:
      'Paginated projection for the dashboard: name, source, upload/creation ' +
      'date, last analysis date, analysis status badge and counters. Soft-deleted ' +
      'resumes never appear.',
  })
  @ApiPagination(RESUME_SORT_FIELDS)
  @ApiOkResponse({
    description: 'Page of resumes',
    type: ResumeListDto,
    example: {
      items: [
        {
          id: '665f1c2d3e4f5a6b7c8d9e0f',
          name: 'Senior Engineer 2026',
          source: 'created',
          analysisStatus: 'completed',
          analysisCount: 2,
          lastAnalyzedAt: '2026-06-09T10:00:00.000Z',
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-09T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 42,
    },
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.UNPROCESSABLE_ENTITY)
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListResumesDto,
  ): Promise<ResumeListDto> {
    const { items, ...meta } = await this.resumes.list(
      new Types.ObjectId(user.id),
      query as unknown as Parameters<ResumesService['list']>[1],
    );
    return { ...meta, items: items.map(toListItem) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of my resumes',
    description:
      'Full document incl. the json-resume content, the optimistic-concurrency ' +
      'version for PATCH, and (for uploads) the extracted original text + parse ' +
      'status. Foreign or deleted ids are a plain 404 — existence is never leaked.',
  })
  @ApiParam({ name: 'id', example: '665f1c2d3e4f5a6b7c8d9e0f' })
  @ApiOkResponse({
    description: 'Resume detail',
    type: ResumeDetailDto,
    example: RESUME_DETAIL_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<ResumeDetailDto> {
    return toDetail(await this.resumes.getById(new Types.ObjectId(user.id), id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a resume (rename and/or replace content)',
    description:
      'Requires the version token from GET. On mismatch (concurrent edit, e.g. ' +
      'in-place editor vs apply-suggestions) responds 409 with currentVersion in ' +
      'details so the client can reload. Placeholders are pruned before storage.',
  })
  @ApiParam({ name: 'id', example: '665f1c2d3e4f5a6b7c8d9e0f' })
  @ApiOkResponse({
    description: 'Updated resume',
    type: ResumeDetailDto,
    example: RESUME_DETAIL_EXAMPLE,
  })
  @ApiStandardErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: UpdateResumeDto,
  ): Promise<ResumeDetailDto> {
    const doc = await this.resumes.update(
      new Types.ObjectId(user.id),
      id,
      body as Required<UpdateResumeDto>,
    );
    return toDetail(doc);
  }

  @Post(':id/reparse')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Retry a failed upload parse',
    description:
      'Re-enqueues AI parsing for an uploaded resume whose parse FAILED. ' +
      'The job is picked up by the background runner within about a second; ' +
      'poll GET /resumes/{id} (uploadParse.status) or listen on SSE (#48). ' +
      'Only the owner may retry; only the failed state is retryable.',
  })
  @ApiParam({ name: 'id', description: 'Resume identifier', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiOkResponse({
    description: 'Parse re-enqueued; uploadParse.status is pending again. (202)',
    schema: {
      example: {
        id: '665f1c2ab79e8e3d4c8a9f01',
        uploadParse: { status: 'pending', retryCount: 0 },
      },
    },
  })
  @ApiStandardErrors(401, 404, 409)
  async reparse(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<{ id: string; uploadParse: unknown }> {
    const doc = await this.resumes.reparse(new Types.ObjectId(user.id), id);
    return { id: String(doc._id), uploadParse: doc.uploadParse };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a resume (soft)',
    description:
      'Soft-deletes the resume (audited). The name becomes available again; ' +
      'associated analyses are cascaded by the admin flow (#54) or remain ' +
      'until their own lifecycle. Idempotency: a second delete is a 404.',
  })
  @ApiParam({ name: 'id', example: '665f1c2d3e4f5a6b7c8d9e0f' })
  @ApiNoContentResponse({ description: 'Deleted (no body)' })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    await this.resumes.softDelete(new Types.ObjectId(user.id), id);
  }
}
