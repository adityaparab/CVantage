import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { AiModelDocument, AiModelStatus, AiModelUsage, UserRole } from '../database/schemas';

import { AdminModelsService } from './admin-models.service';

const createSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(200),
  usages: z.array(z.enum(AiModelUsage)).min(1).max(3),
});

class CreateModelDto extends zodDto(createSchema) {
  @ApiProperty({ example: 'openai' }) declare provider: string;
  @ApiProperty({ example: 'gpt-4o' }) declare modelName: string;
  @ApiProperty({
    description:
      'Provider API key - validated with a live 1-token ping, then encrypted at rest. Never returned again.',
    example: 'sk-live-...3kF9',
  })
  declare apiKey: string;

  @ApiProperty({ enum: AiModelUsage, isArray: true, example: ['analysis', 'fallback'] })
  declare usages: AiModelUsage[];
}

const patchSchema = z
  .object({
    status: z.enum(AiModelStatus).optional(),
    usages: z.array(z.enum(AiModelUsage)).min(1).max(3).optional(),
  })
  .refine((v) => v.status !== undefined || v.usages !== undefined, {
    message: 'Provide status and/or usages',
  });

class PatchModelDto extends zodDto(patchSchema) {
  @ApiProperty({ required: false, enum: AiModelStatus }) declare status?: AiModelStatus;
  @ApiProperty({ required: false, enum: AiModelUsage, isArray: true })
  declare usages?: AiModelUsage[];
}

const rotateSchema = z.object({ apiKey: z.string().trim().min(8).max(200) });

class RotateKeyDto extends zodDto(rotateSchema) {
  @ApiProperty({ description: 'The replacement API key', example: 'sk-live-...ZZ77' })
  declare apiKey: string;
}

/** Masked everywhere: the raw key exists only encrypted at rest. */
const toMasked = (m: AiModelDocument) => ({
  id: String(m._id),
  provider: m.provider,
  modelName: m.modelName,
  apiKeyMasked: `••••${m.apiKeyLast4}`,
  usages: m.usages,
  status: m.status,
  lastUsedAt: m.lastUsedAt,
  createdAt: (m as unknown as { createdAt: Date }).createdAt,
});

/** Admin AI model management (issue #55 / 6.4). */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/models')
export class AdminModelsController {
  constructor(private readonly models: AdminModelsService) {}

  @Get()
  @ApiOperation({
    summary: 'List AI models (admin, masked)',
    description:
      'Every configured model with its key MASKED (last 4 only). Raw keys ' +
      'are AES-256-GCM encrypted at rest and never serialized anywhere - ' +
      'list, detail, audit logs and these docs included.',
  })
  @ApiOkResponse({
    description: 'Configured models.',
    schema: {
      example: [
        {
          id: '665f60aab79e8e3d4c8aa301',
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKeyMasked: '••••3kF9',
          usages: ['analysis', 'fallback'],
          status: 'active',
          lastUsedAt: '2026-06-10T11:58:00.000Z',
        },
      ],
    },
  })
  @ApiStandardErrors(401, 403)
  async list(): Promise<unknown[]> {
    return (await this.models.list()).map(toMasked);
  }

  @Post()
  @ApiOperation({
    summary: 'Add an AI model (admin)',
    description:
      'Validates the key with a live 1-token ping against the provider ' +
      'BEFORE anything is stored (invalid keys are a 422 with the provider ' +
      'reason, key scrubbed). On success the key is encrypted (AES-256-GCM) ' +
      'and only its last 4 characters remain visible. Duplicate ' +
      'provider/model pairs are a 409. Audited.',
  })
  @ApiCreatedResponse({
    description: 'Model stored (masked).',
    schema: {
      example: {
        id: '665f60aab79e8e3d4c8aa301',
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKeyMasked: '••••3kF9',
        usages: ['analysis'],
        status: 'active',
      },
    },
  })
  @ApiStandardErrors(401, 403, 409, 422)
  async create(
    @CurrentUser() actor: RequestUser,
    @Body() body: CreateModelDto,
  ): Promise<ReturnType<typeof toMasked>> {
    return toMasked(await this.models.create(new Types.ObjectId(actor.id), body));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update model status/usages (admin)',
    description:
      'Enable/disable a model or change which usages it serves. Disabled ' +
      'models are skipped by resolution immediately - no restart needed.',
  })
  @ApiParam({ name: 'id', example: '665f60aab79e8e3d4c8aa301' })
  @ApiOkResponse({
    description: 'Updated model (masked).',
    schema: { example: { id: '665f60aab79e8e3d4c8aa301', status: 'disabled' } },
  })
  @ApiStandardErrors(401, 403, 404, 422)
  async update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: PatchModelDto,
  ): Promise<ReturnType<typeof toMasked>> {
    return toMasked(await this.models.update(new Types.ObjectId(actor.id), id, body));
  }

  @Post(':id/rotate-key')
  @ApiOperation({
    summary: 'Rotate a model API key (admin)',
    description:
      'Validates the new key live, re-encrypts it and updates the mask. ' +
      'Resolution picks up the new key on the next call - no restart. The ' +
      'old ciphertext is overwritten. Audited (last 4 only).',
  })
  @ApiParam({ name: 'id', example: '665f60aab79e8e3d4c8aa301' })
  @ApiCreatedResponse({
    description: 'Key rotated (masked).',
    schema: { example: { id: '665f60aab79e8e3d4c8aa301', apiKeyMasked: '••••ZZ77' } },
  })
  @ApiStandardErrors(401, 403, 404, 422)
  async rotate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: RotateKeyDto,
  ): Promise<ReturnType<typeof toMasked>> {
    return toMasked(await this.models.rotateKey(new Types.ObjectId(actor.id), id, body.apiKey));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove an AI model (admin)',
    description:
      'Deletes the model. Guarded: removing the ONLY active model covering ' +
      'a usage while no env fallback (OPENAI_API_KEY) exists is a 409 ' +
      'listing the usages that would be orphaned - disable or replace it ' +
      'first. Audited.',
  })
  @ApiParam({ name: 'id', example: '665f60aab79e8e3d4c8aa301' })
  @ApiNoContentResponse({ description: 'Model removed.' })
  @ApiStandardErrors(401, 403, 404, 409)
  async remove(
    @CurrentUser() actor: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    await this.models.remove(new Types.ObjectId(actor.id), id);
  }
}
