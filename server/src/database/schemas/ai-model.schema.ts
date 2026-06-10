import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { AiModelStatus, AiModelUsage } from './common';

@Schema({ collection: 'aimodels', timestamps: true })
export class AiModel {
  @Prop({ required: true, trim: true, maxlength: 120 }) modelName!: string;
  @Prop({ required: true, trim: true, maxlength: 80 }) provider!: string;

  /** AES-256-GCM ciphertext (CryptoService, #39). NEVER the raw key. */
  @Prop({ required: true, select: false }) apiKeyEncrypted!: string;
  /** Last 4 chars for the masked admin UI ("sk-ant-••••3kF9"). */
  @Prop({ required: true, minlength: 2, maxlength: 8 }) apiKeyLast4!: string;

  @Prop({ type: [String], enum: AiModelUsage, default: [AiModelUsage.ANALYSIS] })
  usages!: AiModelUsage[];

  @Prop({ type: String, enum: AiModelStatus, default: AiModelStatus.ACTIVE })
  status!: AiModelStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) addedBy!: Types.ObjectId;
  @Prop({ type: Date }) lastUsedAt?: Date;
}
export type AiModelDocument = HydratedDocument<AiModel>;
export const AiModelSchema = SchemaFactory.createForClass(AiModel);

AiModelSchema.index(
  { provider: 1, modelName: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
AiModelSchema.index({ status: 1, usages: 1 });

AiModelSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.apiKeyEncrypted;
    return ret;
  },
});
