import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHasherService } from './password-hasher.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasherService],
  exports: [AuthService, PasswordHasherService],
})
export class AuthModule {}
