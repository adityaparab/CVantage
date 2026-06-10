import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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
import { ApiPagination } from '../common/docs/api-pagination.decorator';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { AnalysisDocument } from '../database/schemas';

import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto, ListAnalysesDto } from './dto/analysis.dtos';

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
  tokensUsed: doc.tokensUsed,
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
        tokensUsed: { promptTokens: 5210, completionTokens: 1480, totalTokens: 6690 },
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

  @Get()
  @ApiOperation({
    summary: 'List my analyses (paginated, filterable)',
    description:
      'Newest first. Filter by `resumeId` and/or `status`. Rows are slim - ' +
      'jobDescription, snapshot, suggestions and questions are omitted; fetch ' +
      'GET /analyses/{id} for the full record. Page is 1-based; limit 1-100.',
  })
  @ApiPagination([])
  @ApiOkResponse({
    description: 'One page of analyses with the total count.',
    schema: {
      example: {
        items: [
          {
            id: '665f400ab79e8e3d4c8aa101',
            resumeId: '665f1c2ab79e8e3d4c8a9f01',
            name: 'Platform Engineer @ Acme',
            status: 'completed',
            result: { overallScore: 72, atsScore: 64 },
            durationMs: 34250,
            createdAt: '2026-06-10T12:00:00.000Z',
          },
        ],
        total: 7,
      },
    },
  })
  @ApiStandardErrors(400, 401)
  async listAnalyses(
    @CurrentUser() user: RequestUser,
    @Query() query: ListAnalysesDto,
  ): Promise<{ items: unknown[]; total: number }> {
    const { items, total } = await this.analyses.list(new Types.ObjectId(user.id), query);
    return { items: items.map(toView), total };
  }

  @Post(':id/retry')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Retry a failed analysis',
    description:
      'Re-enqueues a FAILED analysis: failed steps reset to pending, completed ' +
      'step results are kept, the retry budget is reset and the resume rollup ' +
      'returns to in_progress. Any other state is a 409 carrying the current status.',
  })
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiOkResponse({
    description: 'Analysis re-enqueued (202).',
    schema: { example: { id: '665f400ab79e8e3d4c8aa101', status: 'pending' } },
  })
  @ApiStandardErrors(401, 404, 409)
  async retry(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<ReturnType<typeof toView>> {
    return toView(await this.analyses.retry(new Types.ObjectId(user.id), id));
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a pending analysis',
    description:
      'Cancels an analysis that has not started yet (status `pending`). Once a ' +
      'worker claims it (in_progress) cancellation is a 409 - let it finish or ' +
      'fail. The resume rollup returns to its previous state.',
  })
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiOkResponse({
    description: 'Analysis cancelled.',
    schema: { example: { id: '665f400ab79e8e3d4c8aa101', status: 'cancelled' } },
  })
  @ApiStandardErrors(401, 404, 409)
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<ReturnType<typeof toView>> {
    return toView(await this.analyses.cancel(new Types.ObjectId(user.id), id));
  }

  @Post(':id/suggestions/:sid/apply')
  @ApiOperation({
    summary: 'Apply a suggestion to the live resume',
    description:
      "Writes the suggestion's `proposedValue` at its `fieldRef` on the LIVE " +
      'resume (the analysis snapshot is never modified). Array targets append; ' +
      'scalar targets are replaced (deep paths like `work[0].highlights` work). ' +
      'Optimistic concurrency: a concurrent resume edit yields 409 - reload and ' +
      'retry. Applying twice is an idempotent no-op. A suggestion without a ' +
      'proposedValue is a 422 (apply it manually in the editor). If the resume ' +
      'was deleted the analysis remains readable but apply returns 410.',
  })
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiParam({
    name: 'sid',
    description: 'Suggestion identifier (from result.suggestions[]._id)',
    example: '665f41dDb79e8e3d4c8aa777',
  })
  @ApiOkResponse({
    description: 'Suggestion applied (or already applied).',
    schema: {
      example: {
        outcome: 'applied',
        suggestion: {
          _id: '665f41dDb79e8e3d4c8aa777',
          group: 'ats_improvement',
          fieldRef: 'basics.label',
          applied: true,
          appliedAt: '2026-06-10T12:05:00.000Z',
        },
      },
    },
  })
  @ApiStandardErrors(401, 404, 409, 410, 422)
  async applySuggestion(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Param('sid', ObjectIdPipe) sid: Types.ObjectId,
  ): Promise<{ outcome: string; suggestion: unknown }> {
    const { analysis, outcome } = await this.analyses.applySuggestion(
      new Types.ObjectId(user.id),
      id,
      sid,
    );
    const suggestion = (analysis.result?.suggestions ?? []).find(
      (s) => String((s as unknown as { _id: Types.ObjectId })._id) === String(sid),
    );
    return { outcome, suggestion };
  }

  @Post(':id/suggestions/:sid/dismiss')
  @ApiOperation({
    summary: 'Dismiss a suggestion',
    description:
      'Marks the suggestion dismissed so the UI can hide it. Idempotent; the ' +
      'live resume is never touched.',
  })
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiParam({
    name: 'sid',
    description: 'Suggestion identifier',
    example: '665f41dDb79e8e3d4c8aa777',
  })
  @ApiOkResponse({
    description: 'Suggestion dismissed.',
    schema: { example: { id: '665f41dDb79e8e3d4c8aa777', dismissed: true } },
  })
  @ApiStandardErrors(401, 404)
  async dismissSuggestion(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Param('sid', ObjectIdPipe) sid: Types.ObjectId,
  ): Promise<{ id: string; dismissed: boolean }> {
    await this.analyses.dismissSuggestion(new Types.ObjectId(user.id), id, sid);
    return { id: String(sid), dismissed: true };
  }
}
