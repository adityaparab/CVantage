import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { EMAIL_RE, OAuthProvider, URL_RE, UserRole, UserStatus } from './common';

@Schema({ _id: false })
export class OAuthIdentity {
  @Prop({ type: String, enum: OAuthProvider, required: true }) provider!: OAuthProvider;
  @Prop({ required: true, trim: true }) providerUserId!: string;
  @Prop({ trim: true, lowercase: true, match: EMAIL_RE }) email?: string;
  @Prop({ type: Date, default: () => new Date() }) linkedAt!: Date;
}
const OAuthIdentitySchema = SchemaFactory.createForClass(OAuthIdentity);

@Schema({
  collection: 'users',
  timestamps: true,
  optimisticConcurrency: true,
})
export class User {
  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    match: [EMAIL_RE, 'Invalid email'],
    maxlength: 320,
  })
  email!: string;

  /** argon2 hash; absent for OAuth-only accounts. Never selected by default. */
  @Prop({ select: false }) passwordHash?: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  fullName!: string;

  @Prop({ trim: true, match: URL_RE }) avatarUrl?: string;

  /** RBAC — backend-controlled. There is NO separate admin registration flow. */
  @Prop({ type: String, enum: UserRole, default: UserRole.CANDIDATE, index: true })
  role!: UserRole;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Prop({ type: [OAuthIdentitySchema], default: [] })
  oauthIdentities!: OAuthIdentity[];

  @Prop({ default: false }) emailVerified!: boolean;

  @Prop({ type: Date }) lastActiveAt?: Date;
  @Prop({ type: Date }) deactivatedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) deactivatedBy?: Types.ObjectId;

  /** Denormalized counters for dashboards / admin user list (reconciled nightly — D15). */
  @Prop({ default: 0, min: 0 }) resumeCount!: number;
  @Prop({ default: 0, min: 0 }) analysisCount!: number;

  @Prop({ default: 1 }) schemaVersion!: number;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// Unique, case-insensitive email (collation strength 2).
UserSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// One account per OAuth identity. Partial → docs without identities are unaffected.
UserSchema.index(
  { 'oauthIdentities.provider': 1, 'oauthIdentities.providerUserId': 1 },
  { unique: true, partialFilterExpression: { 'oauthIdentities.0': { $exists: true } } },
);
// Admin user search (by name/email prefix) + sorting by registration date.
UserSchema.index({ fullName: 'text', email: 'text' });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ status: 1, lastActiveAt: -1 });

UserSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete (ret as { passwordHash?: string }).passwordHash;
    return ret;
  },
});
