import { Global, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';

import { AdminStatsService } from '../admin/admin-stats.service';
import { AdminController } from '../admin/admin.controller';
import { AnalysesController } from '../analyses/analyses.controller';
import { AnalysesService } from '../analyses/analyses.service';
import { AuditService } from '../audit/audit.service';
import { AccountController } from '../auth/account.controller';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { LockoutService } from '../auth/lockout.service';
import { OAuthController } from '../auth/oauth/oauth.controller';
import { OAuthService } from '../auth/oauth/oauth.service';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { TokensService } from '../auth/tokens.service';
import { VerificationTokensService } from '../auth/verification-tokens.service';
import { AppConfigService } from '../config';
import { User } from '../database/schemas';
import { ProgressBusService } from '../events';
import { HealthModule } from '../health/health.module';
import { MailService } from '../mail/mail.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { ResumesController } from '../resumes/resumes.controller';
import { ResumesService } from '../resumes/resumes.service';
import { UploadController } from '../resumes/upload.controller';
import { UploadService } from '../resumes/upload.service';
import { SseHubService } from '../sse/sse-hub.service';
import { SseController } from '../sse/sse.controller';
import { UsersController } from '../users/users.controller';

/**
 * DB-free assembly of every HTTP controller for documentation purposes
 * (issue #18 / 1.9). MUST list each controller mounted in AppModule —
 * docs.spec's route-coverage test then enforces the documentation contract
 * on the full surface. Add new controllers HERE when adding them to the app.
 */
export const DOCS_FAKE_CONFIG = {
  core: {
    isProd: false,
    swaggerEnabled: true,
    corsOrigins: [],
    logLevel: 'silent',
    appBaseUrl: 'http://docs.local',
  },
  auth: { cookieSecret: 'docs-probe-cookie-secret-docs-probe-cook' },
  oauth: { callbackBaseUrl: 'http://docs.local' },
};

@Global()
@Module({
  providers: [
    { provide: AppConfigService, useValue: DOCS_FAKE_CONFIG },
    { provide: AuthService, useValue: {} },
    { provide: OAuthService, useValue: { enabledProviders: () => ({}) } },
    { provide: TokensService, useValue: {} },
    { provide: PasswordHasherService, useValue: {} },
    { provide: LockoutService, useValue: {} },
    { provide: ResumesService, useValue: {} },
    { provide: AnalysesService, useValue: {} },
    { provide: NotificationsService, useValue: {} },
    { provide: SseHubService, useValue: {} },
    { provide: AdminStatsService, useValue: {} },
    { provide: ProgressBusService, useValue: {} },
    { provide: UploadService, useValue: {} },
    { provide: VerificationTokensService, useValue: {} },
    { provide: MailService, useValue: {} },
    { provide: AuditService, useValue: {} },
    { provide: getModelToken(User.name), useValue: {} },
  ],
  exports: [
    AppConfigService,
    AuthService,
    OAuthService,
    TokensService,
    PasswordHasherService,
    LockoutService,
    ResumesService,
    AnalysesService,
    NotificationsService,
    SseHubService,
    ProgressBusService,
    AdminStatsService,
    UploadService,
    VerificationTokensService,
    MailService,
    AuditService,
    getModelToken(User.name),
  ],
})
class DocsStubsModule {}

@Module({
  imports: [DocsStubsModule, LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }), HealthModule],
  controllers: [
    AuthController,
    AccountController,
    OAuthController,
    UsersController,
    ResumesController,
    UploadController,
    AnalysesController,
    NotificationsController,
    SseController,
    AdminController,
  ],
})
export class DocsProbeModule {}
