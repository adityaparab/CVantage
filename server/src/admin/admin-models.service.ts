import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { AiModelsService } from '../ai/ai-models.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common';
import { AppConfigService } from '../config';
import { AiModelDocument, AiModelStatus, AiModelUsage, AuditAction } from '../database/schemas';

import { ModelKeyValidator } from './model-key-validator.service';

export interface CreateModelInput {
  provider: string;
  modelName: string;
  apiKey: string;
  usages: AiModelUsage[];
}

/** Admin HTTP surface over the #39 registry (issue #55 / 6.4). */
@Injectable()
export class AdminModelsService {
  constructor(
    private readonly registry: AiModelsService,
    private readonly validator: ModelKeyValidator,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<AiModelDocument[]> {
    return this.registry.list();
  }

  async create(actorId: Types.ObjectId, input: CreateModelInput): Promise<AiModelDocument> {
    await this.assertValidKey(input);
    let doc: AiModelDocument;
    try {
      doc = await this.registry.create({ ...input, addedBy: actorId });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new AppException(409, 'Conflict', 'That provider/model combination already exists', {
          provider: input.provider,
          modelName: input.modelName,
        });
      }
      throw err;
    }
    await this.audit.record({
      action: AuditAction.ADMIN_MODEL_ADD,
      actorId,
      targetType: 'aimodel',
      targetId: doc._id as Types.ObjectId,
      meta: { provider: input.provider, modelName: input.modelName, last4: input.apiKey.slice(-4) },
    });
    return doc;
  }

  async update(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    patch: { status?: AiModelStatus; usages?: AiModelUsage[] },
  ): Promise<AiModelDocument> {
    let doc: AiModelDocument | null = null;
    if (patch.status) doc = await this.registry.setStatus(id, patch.status);
    if (patch.usages) doc = await this.registry.setUsages(id, patch.usages);
    if (!doc) throw new NotFoundException('Model not found');
    await this.audit.record({
      action: AuditAction.ADMIN_MODEL_ADD,
      actorId,
      targetType: 'aimodel',
      targetId: id,
      meta: { updated: Object.keys(patch) },
    });
    return doc;
  }

  async rotateKey(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    apiKey: string,
  ): Promise<AiModelDocument> {
    const existing = (await this.registry.list()).find((m) => String(m._id) === String(id));
    if (!existing) throw new NotFoundException('Model not found');
    await this.assertValidKey({
      provider: existing.provider,
      modelName: existing.modelName,
      apiKey,
    });
    const doc = await this.registry.rotateKey(id, apiKey);
    if (!doc) throw new NotFoundException('Model not found');
    await this.audit.record({
      action: AuditAction.ADMIN_MODEL_KEY_ROTATE,
      actorId,
      targetType: 'aimodel',
      targetId: id,
      meta: { last4: apiKey.slice(-4) },
    });
    return doc;
  }

  async remove(actorId: Types.ObjectId, id: Types.ObjectId): Promise<void> {
    const all = await this.registry.list();
    const target = all.find((m) => String(m._id) === String(id));
    if (!target) throw new NotFoundException('Model not found');
    if (target.status === AiModelStatus.ACTIVE && !this.config.llm.openaiApiKey) {
      const others = all.filter(
        (m) => String(m._id) !== String(id) && m.status === AiModelStatus.ACTIVE,
      );
      const covered = (usage: AiModelUsage) =>
        others.some((m) => m.usages.includes(usage) || m.usages.includes(AiModelUsage.FALLBACK));
      const orphaned = target.usages.filter((u) => !covered(u));
      if (orphaned.length > 0) {
        throw new AppException(
          409,
          'Conflict',
          'This is the only active model for some usages and no env fallback is configured - add or activate another model first',
          { orphanedUsages: orphaned },
        );
      }
    }
    await this.registry.remove(id);
    await this.audit.record({
      action: AuditAction.ADMIN_MODEL_REMOVE,
      actorId,
      targetType: 'aimodel',
      targetId: id,
      meta: { provider: target.provider, modelName: target.modelName },
    });
  }

  private async assertValidKey(input: {
    provider: string;
    modelName: string;
    apiKey: string;
  }): Promise<void> {
    const result = await this.validator.validate(input);
    if (!result.ok) {
      throw new AppException(
        422,
        'Unprocessable Entity',
        `API key validation failed: ${result.reason}`,
        {
          provider: input.provider,
          modelName: input.modelName,
        },
      );
    }
  }
}
