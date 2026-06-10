import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Notification,
  NotificationDocument,
  NotificationState,
  NotificationType,
} from '../database/schemas';
import { AnalysisProgressEvent, ProgressBusService } from '../events';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

/** Mongo duplicate-key (the unique ACTIVE-per-analysis partial index). */
const isDupKey = (err: unknown) => (err as { code?: number }).code === 11000;

/**
 * Notification lifecycle (issue #48 / 5.1): one ACTIVE row per analysis.
 * Progress -> upsert in_progress; terminal -> REPLACE IN PLACE (same active
 * slot). The unique partial index makes races a duplicate-key error, which we
 * resolve by retrying as a plain update - last writer wins, never two rows.
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    private readonly bus: ProgressBusService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribeAll((event) => {
      if (event.type !== 'analysis') return;
      void this.onAnalysisEvent(event).catch((err: unknown) =>
        this.logger.error(`notification update failed: ${(err as Error).message}`),
      );
    });
  }

  async onAnalysisEvent(event: AnalysisProgressEvent): Promise<void> {
    const name = event.name ?? 'your resume';
    if (event.status === 'in_progress' && !event.step) {
      await this.upsertActive(event, {
        type: NotificationType.ANALYSIS_IN_PROGRESS,
        title: `Analyzing "${name}"...`,
        body: 'Your analysis is running. We will let you know when it is ready.',
      });
    } else if (event.status === 'completed') {
      await this.upsertActive(event, {
        type: NotificationType.ANALYSIS_COMPLETED,
        title: `Analysis "${name}" is ready`,
        body: 'Open it to see scores, suggestions and interview prep.',
      });
    } else if (event.status === 'failed') {
      await this.upsertActive(event, {
        type: NotificationType.ANALYSIS_FAILED,
        title: `Analysis "${name}" failed`,
        body: 'Something went wrong. You can retry from the analysis page.',
      });
    }
  }

  /** Race-safe single-slot write honoring the unique partial index. */
  private async upsertActive(
    ids: { analysisId: string; userId: string },
    content: { type: NotificationType; title: string; body: string },
  ): Promise<void> {
    const filter = {
      analysisId: new Types.ObjectId(ids.analysisId),
      state: NotificationState.ACTIVE,
    };
    const update = {
      $set: { ...content, userId: new Types.ObjectId(ids.userId) },
      $setOnInsert: {
        state: NotificationState.ACTIVE,
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      },
    };
    try {
      await this.notifications.findOneAndUpdate(filter, update, { upsert: true }).exec();
    } catch (err) {
      if (!isDupKey(err)) throw err;
      // lost the upsert race - the row exists now; plain update wins the slot
      await this.notifications.findOneAndUpdate(filter, update, { upsert: false }).exec();
    }
  }

  async listActive(
    userId: Types.ObjectId,
    q: { page: number; limit: number },
  ): Promise<{ items: NotificationDocument[]; total: number }> {
    const filter = { userId, state: NotificationState.ACTIVE };
    const [items, total] = await Promise.all([
      this.notifications
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.notifications.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /** Manual clear. Idempotent for your own rows; foreign rows are a 404. */
  async clear(userId: Types.ObjectId, id: Types.ObjectId): Promise<NotificationDocument> {
    const doc = await this.notifications.findOne({ _id: id, userId }).exec();
    if (!doc) throw new NotFoundException('Notification not found');
    if (doc.state === NotificationState.CLEARED) return doc;
    doc.state = NotificationState.CLEARED;
    doc.clearedAt = new Date();
    await doc.save();
    this.bus.publish({
      type: 'notification',
      userId: String(userId),
      notificationId: String(id),
      action: 'cleared',
    });
    return doc;
  }

  /** Visit rule: opening the analysis details clears its notification. */
  async clearByAnalysis(userId: Types.ObjectId, analysisId: Types.ObjectId): Promise<void> {
    const res = await this.notifications
      .updateMany(
        { userId, analysisId, state: NotificationState.ACTIVE },
        { $set: { state: NotificationState.CLEARED, clearedAt: new Date() } },
      )
      .exec();
    if (res.modifiedCount > 0) {
      this.bus.publish({
        type: 'notification',
        userId: String(userId),
        analysisId: String(analysisId),
        action: 'cleared',
      });
    }
  }
}
