import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';

import { UsersController } from './users.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsersController],
})
export class UsersModule {}
