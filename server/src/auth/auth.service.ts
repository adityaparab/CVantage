import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AuditService } from '../audit/audit.service';
import { AuditAction, User, UserDocument, UserStatus } from '../database/schemas';

import { PasswordHasherService } from './password-hasher.service';

export interface SanitizedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

/**
 * Local registration & login (issue #22 / 2.1).
 * - duplicate email surfaces as 409 via the unique collated index (#14 maps it)
 * - login responses are uniform for unknown email vs wrong password, and the
 *   hashing work is performed either way (PasswordHasherService.verifyOrBurn)
 * - deactivated accounts are told explicitly (403) per PROMPT.md admin flows
 * - token issuance/cookies layer on in #23; verification mail wires in #26
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly hasher: PasswordHasherService,
    private readonly audit: AuditService,
  ) {}

  sanitize(user: UserDocument): SanitizedUser {
    return {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }

  async register(input: { email: string; fullName: string; password: string }, ip?: string) {
    const passwordHash = await this.hasher.hash(input.password);
    // Duplicate (case-insensitive) email → MongoServerError 11000 → 409 envelope.
    const user = await this.users.create({
      email: input.email,
      fullName: input.fullName,
      passwordHash,
    });
    await this.audit.record({ action: AuditAction.USER_REGISTER, actorId: user._id, ip });
    // TODO(#26): trigger verification mail via MailModule.
    return this.sanitize(user);
  }

  async login(input: { email: string; password: string }, ip?: string) {
    const user = await this.users
      .findOne({ email: input.email.toLowerCase() })
      .select('+passwordHash')
      .exec();

    const ok = await this.hasher.verifyOrBurn(user?.passwordHash, input.password);
    if (!user || !ok) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException('This account has been deactivated');
    }

    user.lastActiveAt = new Date();
    await this.users
      .updateOne({ _id: user._id }, { $set: { lastActiveAt: user.lastActiveAt } })
      .exec();
    await this.audit.record({ action: AuditAction.USER_LOGIN, actorId: user._id, ip });
    return this.sanitize(user);
  }
}
