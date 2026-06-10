import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

/**
 * Global configuration module (issue #11 / 1.2).
 * - loads .env from the server workspace or the repo root
 * - validates the full environment via zod (fail-fast with named keys)
 * - exposes the typed AppConfigService
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
