import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import { AuditAction } from './common';

/** Admin & security-relevant actions. Retained 400 days (TTL). */
@Schema({ collection: 'auditlogs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorId!: Types.ObjectId;

  @Prop({ type: String, enum: AuditAction, required: true }) action!: AuditAction;

  @Prop({ trim: true, maxlength: 40 }) targetType?: string; // 'user' | 'resume' | 'aimodel' …
  @Prop({ type: Types.ObjectId }) targetId?: Types.ObjectId;

  /** Redacted diff / context — never secrets or resume content. */
  @Prop({ type: MongooseSchema.Types.Mixed }) meta?: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 45 }) ip?: string;

  createdAt?: Date;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// Retain 400 days.
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });
