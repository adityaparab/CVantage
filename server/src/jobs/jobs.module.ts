import { Module } from '@nestjs/common';

import { LifecycleModule } from '../lifecycle/lifecycle.module';

import { JobsService } from './jobs.service';

/** Job infrastructure (issue #40 / 4.3) — see MongoJobRunner. */
@Module({
  imports: [LifecycleModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
