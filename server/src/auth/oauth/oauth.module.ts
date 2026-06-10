import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { AppConfigService } from '../../config';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth.module';

import { GoogleAdapter } from './google.adapter';
import { LinkedInAdapter } from './linkedin.adapter';
import { OAUTH_ADAPTERS, OAuthProviderAdapter } from './oauth-provider';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/** Adapters exist only for providers whose env credential pair is present. */
@Module({
  imports: [DatabaseModule, AuditModule, AuthModule],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    {
      provide: OAUTH_ADAPTERS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): OAuthProviderAdapter[] => {
        const adapters: OAuthProviderAdapter[] = [];
        if (config.oauth.google) adapters.push(new GoogleAdapter(config.oauth.google));
        if (config.oauth.linkedin) adapters.push(new LinkedInAdapter(config.oauth.linkedin));
        return adapters;
      },
    },
  ],
  exports: [OAuthService],
})
export class OAuthModule {}
