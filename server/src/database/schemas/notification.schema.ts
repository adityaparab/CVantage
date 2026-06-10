import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { NotificationState, NotificationType } from './common';

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true })
  type!: NotificationType;

  @Prop({ type: Types.ObjectId, ref: 'Analysis', required: true })
  analysisId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 300 }) title!: string;
  @Prop({ trim: true, maxlength: 500 }) body?: string;

  @Prop({ type: String, enum: NotificationState, default: NotificationState.ACTIVE })
  state!: NotificationState;

  /** Cleared when user visits the analysis details page or clears manually. */
  @Prop({ type: Date }) clearedAt?: Date;

  /** Hard TTL — notifications expire 30 days after creation. */
  @Prop({ type: Date, default: () => new Date(Date.now() + 30 * 24 * 3600 * 1000) })
  expiresAt!: Date;
}
export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Bell dropdown: a user's active notifications, newest first.
NotificationSchema.index(
  { userId: 1, state: 1, createdAt: -1 },
  { partialFilterExpression: { state: NotificationState.ACTIVE } },
);
// One ACTIVE notification per analysis (progress → completed replaces in place).
NotificationSchema.index(
  { analysisId: 1 },
  { unique: true, partialFilterExpression: { state: NotificationState.ACTIVE } },
);
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
