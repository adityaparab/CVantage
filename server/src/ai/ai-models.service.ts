import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppException } from '../common';
import { AppConfigService } from '../config';
import { AiModel, AiModelDocument } from '../database/schemas/ai-model.schema';
import { AiModelStatus, AiModelUsage } from '../database/schemas/common';

import { CryptoService } from './crypto.service';

export interface ResolvedModel {
  provider: string;
  modelName: string;
  apiKey: string;
  baseURL?: string;
  /** Where the credentials came from — drives observability labels (#45). */
  source: 'db' | 'env';
}

export interface CreateAiModelInput {
  modelName: string;
  provider: string;
  apiKey: string;
  usages: AiModelUsage[];
  addedBy: Types.ObjectId;
}

/** No admin model and no env fallback — analysis cannot run (503, retryable). */
export class NoModelAvailableError extends AppException {
  constructor(usage: string) {
    super(503, 'Service Unavailable', `No AI model is configured for ${usage}`, {
      usage,
    });
    this.name = 'NoModelAvailableError';
  }
}

const last4 = (key: string) => key.slice(-4);

/**
 * Admin-managed model registry (issue #38 / 4.1). Internal service — the
 * admin HTTP surface arrives with #52. Resolution order (decision D9):
 *   1. ACTIVE db model whose usages include the requested usage (newest first)
 *   2. ACTIVE db model with the FALLBACK usage
 *   3. env credentials (OPENAI_API_KEY + per-usage model name)
 * Keys are AES-256-GCM encrypted at rest and only decrypted at resolve time.
 */
@Injectable()
export class AiModelsService {
  constructor(
    @InjectModel(AiModel.name) private readonly models: Model<AiModel>,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
  ) {}

  async create(input: CreateAiModelInput): Promise<AiModelDocument> {
    return this.models.create({
      modelName: input.modelName,
      provider: input.provider,
      apiKeyEncrypted: this.crypto.encrypt(input.apiKey),
      apiKeyLast4: last4(input.apiKey),
      usages: input.usages,
      addedBy: input.addedBy,
    });
  }

  /** Masked listing — apiKeyEncrypted is select:false AND toJSON-redacted. */
  async list(): Promise<AiModelDocument[]> {
    return this.models.find().sort({ createdAt: -1 }).exec();
  }

  async setStatus(id: Types.ObjectId, status: AiModelStatus): Promise<AiModelDocument | null> {
    return this.models.findByIdAndUpdate(id, { $set: { status } }, { new: true }).exec();
  }

  async setUsages(id: Types.ObjectId, usages: AiModelUsage[]): Promise<AiModelDocument | null> {
    return this.models.findByIdAndUpdate(id, { $set: { usages } }, { new: true }).exec();
  }

  async rotateKey(id: Types.ObjectId, newApiKey: string): Promise<AiModelDocument | null> {
    return this.models
      .findByIdAndUpdate(
        id,
        {
          $set: { apiKeyEncrypted: this.crypto.encrypt(newApiKey), apiKeyLast4: last4(newApiKey) },
        },
        { new: true },
      )
      .exec();
  }

  async remove(id: Types.ObjectId): Promise<boolean> {
    const r = await this.models.deleteOne({ _id: id }).exec();
    return r.deletedCount === 1;
  }

  async resolve(usage: AiModelUsage): Promise<ResolvedModel> {
    const fromDb = await this.findDbModel(usage);
    if (fromDb) {
      return {
        provider: fromDb.provider,
        modelName: fromDb.modelName,
        apiKey: this.crypto.decrypt(fromDb.apiKeyEncrypted),
        baseURL: this.config.llm.openaiBaseUrl ?? undefined,
        source: 'db',
      };
    }
    const env = this.config.llm;
    if (env.openaiApiKey) {
      return {
        provider: env.provider,
        modelName: usage === AiModelUsage.RESUME_PARSING ? env.parsingModel : env.analysisModel,
        apiKey: env.openaiApiKey,
        baseURL: env.openaiBaseUrl ?? undefined,
        source: 'env',
      };
    }
    throw new NoModelAvailableError(usage);
  }

  /** Touch lastUsedAt (fire-and-forget from the LLM layer). */
  async markUsed(provider: string, modelName: string): Promise<void> {
    await this.models
      .updateOne({ provider, modelName }, { $set: { lastUsedAt: new Date() } })
      .exec();
  }

  private async findDbModel(usage: AiModelUsage): Promise<AiModelDocument | null> {
    const direct = await this.models
      .findOne({ status: AiModelStatus.ACTIVE, usages: usage })
      .select('+apiKeyEncrypted')
      .sort({ updatedAt: -1 })
      .exec();
    if (direct) return direct;
    if (usage === AiModelUsage.FALLBACK) return null;
    return this.models
      .findOne({ status: AiModelStatus.ACTIVE, usages: AiModelUsage.FALLBACK })
      .select('+apiKeyEncrypted')
      .sort({ updatedAt: -1 })
      .exec();
  }
}
