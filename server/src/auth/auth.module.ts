import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [DatabaseModule, AuditModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasherService, TokensService],
  exports: [AuthService, PasswordHasherService, TokensService],
})
export class AuthModule {}
