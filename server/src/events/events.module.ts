import { Global, Module } from '@nestjs/common';

import { ProgressBusService } from './progress-bus.service';

/** Progress events (issue #41 / 4.4) — global: pipelines + SSE both use it. */
@Global()
@Module({
  providers: [ProgressBusService],
  exports: [ProgressBusService],
})
export class EventsModule {}
