import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import { z } from 'zod';

import { CurrentUser, Roles } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { zodDto } from '../common';
import { ApiPagination } from '../common/docs/api-pagination.decorator';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { EMAIL_RE, UserDocument, UserRole, UserStatus } from '../database/schemas';

import { AdminUsersService } from './admin-users.service';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z
    .enum(['createdAt', 'lastActiveAt', 'fullName', 'email', 'resumeCount', 'analysisCount'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

class ListAdminUsersDto extends zodDto(listSchema) {
  @ApiProperty({ required: false, default: 1 }) declare page: number;
  @ApiProperty({ required: false, default: 20, maximum: 100 }) declare limit: number;
  @ApiProperty({
    required: false,
    description: 'User id (exact) or an email/name prefix (case-insensitive)',
    example: 'ada@',
  })
  declare search?: string;

  @ApiProperty({
    required: false,
    enum: ['createdAt', 'lastActiveAt', 'fullName', 'email', 'resumeCount', 'analysisCount'],
    default: 'createdAt',
  })
  declare sortBy:
    | 'createdAt'
    | 'lastActiveAt'
    | 'fullName'
    | 'email'
    | 'resumeCount'
    | 'analysisCount';

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  declare order: 'asc' | 'desc';
}

const patchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().regex(EMAIL_RE, 'Invalid email').optional(),
  })
  .refine((v) => v.fullName !== undefined || v.email !== undefined, {
    message: 'Provide at least one field to update',
  });

class PatchAdminUserDto extends zodDto(patchSchema) {
  @ApiProperty({ required: false, example: 'Ada Lovelace' }) declare fullName?: string;
  @ApiProperty({ required: false, example: 'ada@example.com' }) declare email?: string;
}

const resetSchema = z.object({ mode: z.enum(['temporary', 'email']) });

class ResetPasswordModeDto extends zodDto(resetSchema) {
  @ApiProperty({
    enum: ['temporary', 'email'],
    description:
      '`temporary`: returns a one-time temporary password (shown exactly once) and forces a change at next login. `email`: sends the standard reset link.',
    example: 'email',
  })
  declare mode: 'temporary' | 'email';
}

const toRow = (u: UserDocument) => ({
  id: String(u._id),
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  status: u.status,
  createdAt: (u as unknown as { createdAt: Date }).createdAt,
  lastActiveAt: u.lastActiveAt,
  resumeCount: u.resumeCount,
  analysisCount: u.analysisCount,
});

/** Admin user management (issue #53 / 6.2). */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Search/list users (admin)',
    description:
      'Search by exact user id, or by case-insensitive email/name prefix. ' +
      'Rows carry registration date, last activity and resume/analysis ' +
      'counters. Sortable by any listed column; newest first by default.',
  })
  @ApiPagination(['createdAt', 'lastActiveAt', 'fullName', 'email', 'resumeCount', 'analysisCount'])
  @ApiOkResponse({
    description: 'One page of users.',
    schema: {
      example: {
        items: [
          {
            id: '665f1c2ab79e8e3d4c8a9f01',
            fullName: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'candidate',
            status: 'active',
            createdAt: '2026-06-01T10:00:00.000Z',
            lastActiveAt: '2026-06-10T09:30:00.000Z',
            resumeCount: 3,
            analysisCount: 7,
          },
        ],
        total: 1280,
      },
    },
  })
  @ApiStandardErrors(400, 401, 403)
  async list(@Query() query: ListAdminUsersDto): Promise<{ items: unknown[]; total: number }> {
    const { items, total } = await this.adminUsers.list(query);
    return { items: items.map(toRow), total };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'User details (admin)',
    description:
      'Profile, status and counters for one user. Never includes password ' +
      'hashes or tokens (schema-level redaction).',
  })
  @ApiParam({ name: 'id', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiOkResponse({
    description: 'The user.',
    schema: {
      example: {
        id: '665f1c2ab79e8e3d4c8a9f01',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'candidate',
        status: 'active',
        resumeCount: 3,
        analysisCount: 7,
      },
    },
  })
  @ApiStandardErrors(401, 403, 404)
  async get(@Param('id', ObjectIdPipe) id: Types.ObjectId): Promise<ReturnType<typeof toRow>> {
    return toRow(await this.adminUsers.getById(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a user profile (admin)',
    description:
      'Edits fullName and/or email. Emails are unique case-insensitively - ' +
      'collisions are a 409. Every change is audited with a field diff.',
  })
  @ApiParam({ name: 'id', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiOkResponse({
    description: 'Updated user.',
    schema: { example: { id: '665f1c2ab79e8e3d4c8a9f01', email: 'new@example.com' } },
  })
  @ApiStandardErrors(401, 403, 404, 409, 422)
  async update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: PatchAdminUserDto,
  ): Promise<ReturnType<typeof toRow>> {
    return toRow(await this.adminUsers.update(new Types.ObjectId(actor.id), id, body));
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'Reset a user password (admin)',
    description:
      'Two modes. `temporary` generates a strong temporary password, ' +
      'returns it EXACTLY ONCE in this response (it is stored only as an ' +
      'argon2id hash and never logged), revokes all refresh tokens and ' +
      'forces a change at next login. `email` sends the standard reset ' +
      'link to the user. Both are audited.',
  })
  @ApiParam({ name: 'id', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiCreatedResponse({
    description: 'Reset performed.',
    schema: {
      example: { mode: 'temporary', temporaryPassword: 'V2hhdCBhIHRlbXA' },
    },
  })
  @ApiStandardErrors(401, 403, 404, 422)
  async resetPassword(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: ResetPasswordModeDto,
  ): Promise<{ mode: string; temporaryPassword?: string }> {
    return this.adminUsers.resetPassword(new Types.ObjectId(actor.id), id, body.mode);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a user (admin)',
    description:
      'Sets status=deactivated and revokes every refresh token; the next ' +
      'request with an existing access token is rejected by the ' +
      'ActiveUserGuard. Self-deactivation is blocked (409). Idempotent.',
  })
  @ApiParam({ name: 'id', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiCreatedResponse({
    description: 'User deactivated.',
    schema: { example: { id: '665f1c2ab79e8e3d4c8a9f01', status: 'deactivated' } },
  })
  @ApiStandardErrors(401, 403, 404, 409)
  async deactivate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<{ id: string; status: string }> {
    const doc = await this.adminUsers.setStatus(
      new Types.ObjectId(actor.id),
      id,
      UserStatus.DEACTIVATED,
    );
    return { id: String(doc._id), status: doc.status };
  }

  @Post(':id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a user (admin)',
    description: 'Sets status=active again. The user must log in afresh. Idempotent.',
  })
  @ApiParam({ name: 'id', example: '665f1c2ab79e8e3d4c8a9f01' })
  @ApiCreatedResponse({
    description: 'User reactivated.',
    schema: { example: { id: '665f1c2ab79e8e3d4c8a9f01', status: 'active' } },
  })
  @ApiStandardErrors(401, 403, 404)
  async reactivate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<{ id: string; status: string }> {
    const doc = await this.adminUsers.setStatus(
      new Types.ObjectId(actor.id),
      id,
      UserStatus.ACTIVE,
    );
    return { id: String(doc._id), status: doc.status };
  }
}
