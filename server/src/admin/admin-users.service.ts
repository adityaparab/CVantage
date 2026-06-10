import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuditService } from '../audit/audit.service';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { TokensService } from '../auth/tokens.service';
import { VerificationTokensService } from '../auth/verification-tokens.service';
import { AppException } from '../common';
import { AuditAction, TokenKind, User, UserDocument, UserStatus } from '../database/schemas';
import { MailService } from '../mail/mail.service';

export interface AdminUserListQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy: 'createdAt' | 'lastActiveAt' | 'fullName' | 'email' | 'resumeCount' | 'analysisCount';
  order: 'asc' | 'desc';
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Admin user management (issue #53 / 6.2). Every mutation is audited with
 * actor + target; secrets never serialize (schema toJSON + projections).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationTokensService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async list(q: AdminUserListQuery): Promise<{ items: UserDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (q.search && q.search.trim().length > 0) {
      const term = q.search.trim();
      if (/^[a-f0-9]{24}$/i.test(term)) {
        filter._id = new Types.ObjectId(term);
      } else {
        const prefix = new RegExp('^' + escapeRegex(term), 'i');
        filter.$or = [{ email: prefix }, { fullName: prefix }];
      }
    }
    const [items, total] = await Promise.all([
      this.users
        .find(filter)
        .select('fullName email role status createdAt lastActiveAt resumeCount analysisCount')
        .sort({ [q.sortBy]: q.order === 'asc' ? 1 : -1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.users.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async getById(id: Types.ObjectId): Promise<UserDocument> {
    const doc = await this.users.findById(id).exec();
    if (!doc) throw new NotFoundException('User not found');
    return doc;
  }

  async update(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    patch: { fullName?: string; email?: string },
  ): Promise<UserDocument> {
    const doc = await this.getById(id);
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (patch.fullName && patch.fullName !== doc.fullName) {
      diff.fullName = { from: doc.fullName, to: patch.fullName };
      doc.fullName = patch.fullName;
    }
    if (patch.email && patch.email.toLowerCase() !== doc.email.toLowerCase()) {
      diff.email = { from: doc.email, to: patch.email };
      doc.email = patch.email.toLowerCase();
    }
    if (Object.keys(diff).length === 0) return doc;
    try {
      await doc.save();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new AppException(409, 'Conflict', 'That email address is already in use', {
          email: patch.email,
        });
      }
      throw err;
    }
    await this.audit.record({
      action: AuditAction.ADMIN_USER_UPDATE,
      actorId,
      targetType: 'user',
      targetId: id,
      meta: { changedFields: Object.keys(diff), diff },
    });
    return doc;
  }

  /** Two modes: temporary password (returned ONCE) or reset email. */
  async resetPassword(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    mode: 'temporary' | 'email',
  ): Promise<{ mode: string; temporaryPassword?: string }> {
    const doc = await this.getById(id);
    if (mode === 'temporary') {
      const temporaryPassword = randomBytes(12).toString('base64url');
      doc.passwordHash = await this.hasher.hash(temporaryPassword);
      doc.mustChangePassword = true;
      await doc.save();
      await this.tokens.revokeAllForUser(id);
      await this.audit.record({
        action: AuditAction.ADMIN_PASSWORD_RESET,
        actorId,
        targetType: 'user',
        targetId: id,
        meta: { mode },
      });
      return { mode, temporaryPassword }; // never logged, never persisted in clear
    }
    const token = await this.verification.issue(TokenKind.PASSWORD_RESET, id);
    await this.mail.sendPasswordReset(doc.email, token);
    await this.audit.record({
      action: AuditAction.ADMIN_PASSWORD_RESET,
      actorId,
      targetType: 'user',
      targetId: id,
      meta: { mode },
    });
    return { mode };
  }

  async setStatus(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    status: UserStatus,
  ): Promise<UserDocument> {
    if (String(actorId) === String(id) && status === UserStatus.DEACTIVATED) {
      throw new AppException(409, 'Conflict', 'You cannot deactivate your own account', {});
    }
    const doc = await this.getById(id);
    if (doc.status === status) return doc; // idempotent
    doc.status = status;
    await doc.save();
    if (status === UserStatus.DEACTIVATED) {
      await this.tokens.revokeAllForUser(id);
    }
    await this.audit.record({
      action: AuditAction.ADMIN_USER_DEACTIVATE,
      actorId,
      targetType: 'user',
      targetId: id,
      meta: { status },
    });
    return doc;
  }
}
