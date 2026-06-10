import { AiModel, AiModelSchema } from './ai-model.schema';
import { Analysis, AnalysisSchema } from './analysis.schema';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuthToken, AuthTokenSchema } from './auth-token.schema';
import { Notification, NotificationSchema } from './notification.schema';
import { Resume, ResumeSchema } from './resume.schema';
import { User, UserSchema } from './user.schema';

export * from './common';
export * from './json-resume.schema';
export * from './user.schema';
export * from './resume.schema';
export * from './analysis.schema';
export * from './notification.schema';
export * from './ai-model.schema';
export * from './auth-token.schema';
export * from './audit-log.schema';

/** Registered by DatabaseModule; import via `MongooseModule.forFeature(MODEL_DEFINITIONS)`. */
export const MODEL_DEFINITIONS = [
  { name: User.name, schema: UserSchema },
  { name: Resume.name, schema: ResumeSchema },
  { name: Analysis.name, schema: AnalysisSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: AiModel.name, schema: AiModelSchema },
  { name: AuthToken.name, schema: AuthTokenSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
];
