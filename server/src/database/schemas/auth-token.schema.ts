import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { TokenKind } from './common';

/** Refresh / password-reset / email-verify tokens (TTL). */
@Schema({ collection: 'authtokens', timestamps: true })
export class AuthToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: TokenKind, required: true }) kind!: TokenKind;

  /** SHA-256 of the opaque token — the raw token is never stored. */
  @Prop({ required: true, select: false }) tokenHash!: string;

  @Prop({ type: Date, required: true }) expiresAt!: Date;
  @Prop({ type: Date }) consumedAt?: Date;

  /* Session forensics (refresh tokens) */
  @Prop({ trim: true, maxlength: 45 }) ip?: string;
  @Prop({ trim: true, maxlength: 400 }) userAgent?: string;
}
export type AuthTokenDocument = HydratedDocument<AuthToken>;
export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);

AuthTokenSchema.index({ tokenHash: 1 }, { unique: true });
AuthTokenSchema.index({ userId: 1, kind: 1 });
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
