import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Notification, NotificationSchema } from '../database/schemas';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Bell notifications (issue #48 / 5.1). */
@Module({
  imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
