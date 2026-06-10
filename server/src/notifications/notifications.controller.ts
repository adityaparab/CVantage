import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { zodDto } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { NotificationDocument } from '../database/schemas';

import { NotificationsService } from './notifications.service';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

class ListNotificationsDto extends zodDto(listSchema) {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  declare page: number;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50 })
  declare limit: number;
}

const toView = (doc: NotificationDocument) => ({
  id: String(doc._id),
  analysisId: String(doc.analysisId),
  type: doc.type,
  title: doc.title,
  body: doc.body,
  state: doc.state,
  createdAt: (doc as unknown as { createdAt: Date }).createdAt,
});

/** Bell notifications (issue #48 / 5.1). */
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'My active notifications (the bell)',
    description:
      'ACTIVE notifications, newest first, paginated. One notification exists ' +
      'per analysis at a time: it appears when the analysis starts, is replaced ' +
      'in place on completion/failure, and disappears when you open the ' +
      'analysis details or clear it manually. Rows expire after 30 days.',
  })
  @ApiOkResponse({
    description: 'One page of active notifications.',
    schema: {
      example: {
        items: [
          {
            id: '665f50aab79e8e3d4c8aa201',
            analysisId: '665f400ab79e8e3d4c8aa101',
            type: 'analysis_completed',
            title: 'Analysis "PE @ Acme" is ready',
            body: 'Open it to see scores, suggestions and interview prep.',
            state: 'active',
            createdAt: '2026-06-10T12:01:00.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  @ApiStandardErrors(400, 401)
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsDto,
  ): Promise<{ items: unknown[]; total: number }> {
    const { items, total } = await this.notifications.listActive(
      new Types.ObjectId(user.id),
      query,
    );
    return { items: items.map(toView), total };
  }

  @Post(':id/clear')
  @ApiOperation({
    summary: 'Clear a notification',
    description:
      'Marks the notification cleared so it leaves the bell. Idempotent for ' +
      "your own notifications; anyone else's are an existence-hiding 404.",
  })
  @ApiParam({
    name: 'id',
    description: 'Notification identifier',
    example: '665f50aab79e8e3d4c8aa201',
  })
  @ApiOkResponse({
    description: 'Notification cleared.',
    schema: { example: { id: '665f50aab79e8e3d4c8aa201', state: 'cleared' } },
  })
  @ApiStandardErrors(401, 404)
  async clear(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ): Promise<{ id: string; state: string }> {
    const doc = await this.notifications.clear(new Types.ObjectId(user.id), id);
    return { id: String(doc._id), state: doc.state };
  }
}
