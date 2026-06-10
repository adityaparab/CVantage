import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { z } from 'zod';

import { CurrentUser, Roles } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { zodDto } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { ResumeDocument, UserRole } from '../database/schemas';

import { AdminResumesService } from './admin-resumes.service';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

class AdminResumeListQueryDto extends zodDto(listSchema) {
  @ApiProperty({ required: false, default: 1 }) declare page: number;
  @ApiProperty({ required: false, default: 20, maximum: 100 }) declare limit: number;
}

/** THE privacy boundary: exactly these fields, nothing else, ever. */
export const ADMIN_RESUME_ROW_KEYS = [
  'id',
  'name',
  'source',
  'createdAt',
  'analysisCount',
  'analysisStatus',
] as const;

export const toAdminResumeRow = (
  doc: ResumeDocument,
): Record<(typeof ADMIN_RESUME_ROW_KEYS)[number], unknown> => ({
  id: String(doc._id),
  name: doc.name,
  source: doc.source,
  createdAt: (doc as unknown as { createdAt: Date }).createdAt,
  analysisCount: doc.analysisCount,
  analysisStatus: doc.analysisStatus,
});

/** Admin resume oversight (issue #54 / 6.3). */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminResumesController {
  constructor(private readonly adminResumes: AdminResumesService) {}

  @Get('users/:id/resumes')
  @ApiOperation({
    summary: "A user's resumes - metadata only (admin)",
    description:
      "Lists a user's live resumes for oversight: name, source, creation " +
      'date, analysis count and status. BY DESIGN the admin API never ' +
      'exposes resume content (jsonResume), extracted text or analysis ' +
      'results anywhere - the projection is a structural whitelist, not a ' +
      'convention.',
  })
  @ApiParam({ name: 'id', description: 'User identifier', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiOkResponse({
    description: 'Metadata rows.',
    schema: {
      example: {
        items: [
          {
            id: '665f1c2db79e8e3d4c8a9f05',
            name: 'Backend Resume',
            source: 'uploaded',
            createdAt: '2026-06-08T10:00:00.000Z',
            analysisCount: 2,
            analysisStatus: 'completed',
          },
        ],
        total: 3,
      },
    },
  })
  @ApiStandardErrors(400, 401, 403, 404)
  async listForUser(
    @Param('id', ObjectIdPipe) userId: Types.ObjectId,
    @Query() query: AdminResumeListQueryDto,
  ): Promise<{ items: unknown[]; total: number }> {
    const { items, total } = await this.adminResumes.listForUser(userId, query);
    return { items: items.map(toAdminResumeRow), total };
  }

  @Delete('resumes/:id')
  @ApiOperation({
    summary: 'Delete a resume with its analyses (admin)',
    description:
      'Soft-deletes the resume, cascades to its analyses, clears their ' +
      "active notifications and corrects the owner's counters - in ordered, " +
      'idempotent steps that re-run safely after a partial failure (no ' +
      'transactions needed). Audited with ids and counts only, never ' +
      'content. Returns what the cascade touched.',
  })
  @ApiParam({ name: 'id', description: 'Resume identifier', example: '665f1c2db79e8e3d4c8a9f05' })
  @ApiOkResponse({
    description: 'Cascade summary.',
    schema: {
      example: { resumeDeleted: true, analysesDeleted: 2, notificationsCleared: 1 },
    },
  })
  @ApiStandardErrors(401, 403, 404)
  async cascadeDelete(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<{ resumeDeleted: boolean; analysesDeleted: number; notificationsCleared: number }> {
    return this.adminResumes.cascadeDelete(new Types.ObjectId(actor.id), id);
  }
}
