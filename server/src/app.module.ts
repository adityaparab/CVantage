import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter, ZodValidationPipe } from './common';
import { AppConfigModule, AppConfigService } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { LoggingModule } from './observability/logging.module';

/**
 * Application root. Feature modules are registered here as they land:
 * security (#16), swagger (#18), and the domain modules
 * from Phase 2 onward (PLAN.md §7.1).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    HealthModule,
    LifecycleModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.throttle.ttlSeconds * 1000,
            limit: config.throttle.limit,
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
