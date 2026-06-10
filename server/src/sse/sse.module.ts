import { Module } from '@nestjs/common';

import { AnalysesModule } from '../analyses/analyses.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { SseHubService } from './sse-hub.service';
import { SseController } from './sse.controller';

/** Live progress streams (issue #49 / 5.2). */
@Module({
  imports: [AnalysesModule, NotificationsModule, LifecycleModule],
  controllers: [SseController],
  providers: [SseHubService],
  exports: [SseHubService],
})
export class SseModule {}
