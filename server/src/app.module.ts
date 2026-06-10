import { Module } from '@nestjs/common';

/**
 * Application root. Feature modules are registered here as they land:
 * config (#11), database (#12), observability (#13), errors (#14),
 * health (#15), security (#16), swagger (#18), and the domain modules
 * from Phase 2 onward (see PLAN.md §7.1).
 */
@Module({
  imports: [],
})
export class AppModule {}
