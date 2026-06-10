import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PinoLogger } from 'nestjs-pino';

import { AuditAction, AuditLog } from '../database/schemas';

export interface AuditEntry {
  action: AuditAction;
  actorId: Types.ObjectId | string;
  targetType?: string;
  targetId?: Types.ObjectId | string;
  /** Redacted context only — never secrets or resume content. */
  meta?: Record<string, unknown>;
  ip?: string;
}

/**
 * Security/audit trail writer (issue #22 / 2.1; consumed across phases).
 * Best-effort by design: an audit failure is logged but never breaks the
 * user-facing operation.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.model.create({
        ...entry,
        actorId: new Types.ObjectId(entry.actorId),
        ...(entry.targetId ? { targetId: new Types.ObjectId(entry.targetId) } : {}),
      });
    } catch (err) {
      this.logger.error({ err, action: entry.action }, 'audit write failed');
    }
  }
}
