import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { UserRole } from '../database/schemas';

import { AdminStats, AdminStatsService } from './admin-stats.service';

/** Admin surface (Phase 6). Every route requires the admin role. */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Dashboard stats (admin)',
    description:
      'Platform totals for the admin dashboard: registered users, live ' +
      'resumes (created + uploaded; soft-deleted excluded) and all-time ' +
      'analyses. Served from a short in-memory cache (default 60s; ' +
      'ADMIN_STATS_CACHE_S) - generatedAt tells you how fresh the numbers ' +
      'are. Requires the admin role: candidates get 403, anonymous 401.',
  })
  @ApiOkResponse({
    description: 'Platform totals.',
    schema: {
      example: {
        users: 1280,
        resumes: 3411,
        analyses: 5120,
        generatedAt: '2026-06-10T12:00:00.000Z',
      },
    },
  })
  @ApiStandardErrors(401, 403)
  async stats(): Promise<AdminStats> {
    return this.statsService.stats();
  }
}
