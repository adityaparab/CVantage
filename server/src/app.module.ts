import { Module } from '@nestjs/common';

import { AppConfigModule } from './config';
import { DatabaseModule } from './database/database.module';

/**
 * Application root. Feature modules are registered here as they land:
 * observability (#13), errors (#14), health (#15), security (#16),
 * swagger (#18), and the domain modules from Phase 2 onward (PLAN.md §7.1).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule],
})
export class AppModule {}
