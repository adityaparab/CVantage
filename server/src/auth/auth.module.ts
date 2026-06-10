import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';

import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokensService } from './tokens.service';
import { VerificationTokensService } from './verification-tokens.service';

@Module({
  imports: [DatabaseModule, AuditModule, JwtModule.register({})],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    PasswordHasherService,
    TokensService,
    VerificationTokensService,
    LockoutService,
  ],
  exports: [
    AuthService,
    PasswordHasherService,
    TokensService,
    VerificationTokensService,
    LockoutService,
  ],
})
export class AuthModule {}
