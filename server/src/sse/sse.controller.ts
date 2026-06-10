import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Types } from 'mongoose';

import { AnalysesService } from '../analyses/analyses.service';
import { toAnalysisView } from '../analyses/analysis.view';
import { CurrentUser } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';
import { ProgressBusService } from '../events';
import { NotificationsService } from '../notifications/notifications.service';

import { SseHubService } from './sse-hub.service';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Live progress streams (issue #49 / 5.2, decision D14). Payloads are the
 * SAME DTOs the polling endpoints return - SSE is purely a transport upgrade.
 */
@ApiTags('Events (SSE)')
@Controller()
export class SseController {
  constructor(
    private readonly hub: SseHubService,
    private readonly analyses: AnalysesService,
    private readonly notifications: NotificationsService,
    private readonly bus: ProgressBusService,
  ) {}

  @Get('analyses/:id/events')
  @ApiOperation({
    summary: 'Live analysis progress (SSE)',
    description:
      'Server-sent events for one analysis. On connect (with or without ' +
      'Last-Event-ID) the CURRENT full snapshot is sent first - reconnecting ' +
      'mid-run can never miss the terminal state. Then `status` events follow ' +
      'for each step transition, and the stream closes itself after the ' +
      'terminal event. Heartbeat comments every 15s keep proxies open. ' +
      'Authenticate with the access-token cookie (EventSource cannot set ' +
      'headers). Polling fallback: GET /analyses/{id} returns the identical ' +
      'DTO. Event names: `snapshot`, `status`, `shutdown`.',
  })
  @ApiProduces('text/event-stream')
  @ApiParam({ name: 'id', description: 'Analysis identifier', example: '665f400ab79e8e3d4c8aa101' })
  @ApiOkResponse({
    description: 'An event stream (text/event-stream).',
    schema: {
      example:
        'id: 0\nevent: snapshot\ndata: {"id":"665f4...","status":"in_progress","steps":[...]}\n\n' +
        'id: 1\nevent: status\ndata: {"id":"665f4...","status":"completed",...}\n\n',
    },
  })
  @ApiStandardErrors(401, 404, 429)
  async analysisEvents(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Res() res: Response,
  ): Promise<void> {
    // ownership/existence FIRST - errors must be normal JSON responses
    const doc = await this.analyses.getById(new Types.ObjectId(user.id), id);
    const conn = this.hub.open(user.id, res);
    let eventId = 0;
    const sendSnapshot = (snapshot: unknown, name: string) =>
      conn.send(name, snapshot, (eventId += 1));
    sendSnapshot(toAnalysisView(doc), 'snapshot');
    if (TERMINAL.has(doc.status)) {
      conn.close();
      return;
    }
    const unsubscribe = this.bus.subscribe(user.id, (event) => {
      if (event.type !== 'analysis' || event.analysisId !== String(id)) return;
      void this.analyses
        .getById(new Types.ObjectId(user.id), id)
        .then((fresh) => {
          sendSnapshot(toAnalysisView(fresh), 'status');
          if (TERMINAL.has(fresh.status)) conn.close();
        })
        .catch(() => conn.close());
    });
    conn.onClose(unsubscribe);
  }

  @Get('notifications/events')
  @ApiOperation({
    summary: 'Live bell updates (SSE)',
    description:
      'Server-sent events for the notification bell. On connect the current ' +
      'active list is sent as a `snapshot`; afterwards every bell change ' +
      '(new/replaced/cleared notification) re-sends the fresh list as a ' +
      '`bell` event - the payload is identical to GET /notifications. ' +
      'Heartbeats every 15s; close and reconnect freely.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'An event stream (text/event-stream).',
    schema: {
      example:
        'id: 0\nevent: snapshot\ndata: {"items":[{"id":"665f5...","type":"analysis_completed"}],"total":1}\n\n',
    },
  })
  @ApiStandardErrors(401, 429)
  async notificationEvents(@CurrentUser() user: RequestUser, @Res() res: Response): Promise<void> {
    const userId = new Types.ObjectId(user.id);
    const conn = this.hub.open(user.id, res);
    let eventId = 0;
    const sendBell = async (name: string) => {
      const { items, total } = await this.notifications.listActive(userId, {
        page: 1,
        limit: 20,
      });
      conn.send(
        name,
        {
          items: items.map((n) => ({
            id: String(n._id),
            analysisId: String(n.analysisId),
            type: n.type,
            title: n.title,
            body: n.body,
            state: n.state,
            createdAt: (n as unknown as { createdAt: Date }).createdAt,
          })),
          total,
        },
        (eventId += 1),
      );
    };
    await sendBell('snapshot');
    const unsubscribe = this.bus.subscribe(user.id, (event) => {
      if (event.type === 'notification' || event.type === 'analysis') {
        void sendBell('bell').catch(() => conn.close());
      }
    });
    conn.onClose(unsubscribe);
  }
}
