import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { CurrentUser } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { AnalysisDocument } from '../database/schemas';

import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/analysis.dtos';

const toView = (doc: AnalysisDocument) => ({
  id: String(doc._id),
  resumeId: String(doc.resumeId),
  name: doc.name,
  status: doc.status,
  steps: doc.steps.map((s) => ({
    key: s.key,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    error: s.error,
  })),
  result: doc.result,
  modelUsed: doc.modelUsed,
  error: doc.error,
  startedAt: doc.startedAt,
  completedAt: doc.completedAt,
  durationMs: doc.durationMs,
  createdAt: (doc as unknown as { createdAt: Date }).createdAt,
});

/** Analysis intake + polling (issue #42 / 4.5); list/apply land with #43. */
@ApiTags('Analyses')
@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a resume-vs-job-description analysis',
    description:
      'Snapshots the resume and queues the fixed 3-step pipeline ' +
      '(compare, suggestions, interview questions). The response returns ' +
      'immediately with status `pending`; progress arrives via SSE (#48) or by ' +
      'polling GET /analyses/{id}. Later edits to the resume do not affect a ' +
      'running analysis - it works off the snapshot. Job descriptions must be ' +
      '30-50,000 characters.',
  })
  @ApiCreatedResponse({
    description: 'Analysis created and queued.',
    schema: {
      example: {
        id: '665f400ab79e8e3d4c8aa101',
        resumeId: '665f1c2ab79e8e3d4c8a9f01',
        name: 'Platform Engineer @ Acme',
        status: 'pending',
        steps: [
          { key: 'compare_resume_jd', status: 'pending' },
          { key: 'generate_suggestions', status: 'pending' },
          { key: 'prepare_interview_questions', status: 'pending' },
        ],
        createdAt: '2026-06-10T12:00:00.000Z',
      },
    },
  })
  @ApiStandardErrors(401, 404, 422, 429)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateAnalysisDto,
  ): Promise<ReturnType<typeof toView>> {
    const doc = await this.analyses.create(new Types.ObjectId(user.id), body);
    return toView(doc);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one analysis (steps, result, errors)',
    description:
      'Full analysis state for the owner: per-step status with timestamps, ' +
      'the incrementally persisted result (comparison scores, validated ' +
      'suggestions, interview questions), terminal error if failed. Suitable ' +
      'as a polling fallback when SSE is unavailable.',
  })
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiOkResponse({
    description: 'The analysis.',
    schema: {
      example: {
        id: '665f400ab79e8e3d4c8aa101',
        status: 'completed',
        steps: [{ key: 'compare_resume_jd', status: 'completed' }],
        result: { overallScore: 72, atsScore: 64, suggestions: [] },
        durationMs: 34250,
      },
    },
  })
  @ApiStandardErrors(401, 404)
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<ReturnType<typeof toView>> {
    return toView(await this.analyses.getById(new Types.ObjectId(user.id), id));
  }
}
