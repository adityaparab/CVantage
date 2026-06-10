import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AuditService } from '../../audit/audit.service';
import { AuditAction, OAuthProvider, User, UserDocument, UserStatus } from '../../database/schemas';
import { AuthService, SanitizedUser } from '../auth.service';

import { OAUTH_ADAPTERS, OAuthProfile, OAuthProviderAdapter } from './oauth-provider';

/**
 * Provider-agnostic OAuth account resolution (issue #25 / 2.4).
 * Order: existing identity → login · verified-email match → link + login ·
 * fresh email → create · unverified email colliding with an account → 409.
 */
@Injectable()
export class OAuthService {
  private readonly adapters = new Map<OAuthProvider, OAuthProviderAdapter>();

  constructor(
    @Optional() @Inject(OAUTH_ADAPTERS) adapters: OAuthProviderAdapter[] | undefined,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {
    for (const a of adapters ?? []) this.adapters.set(a.name, a);
  }

  enabledProviders(): Record<OAuthProvider, boolean> {
    return {
      [OAuthProvider.GOOGLE]: this.adapters.has(OAuthProvider.GOOGLE),
      [OAuthProvider.LINKEDIN]: this.adapters.has(OAuthProvider.LINKEDIN),
    };
  }

  /** 404 for disabled providers — the route effectively does not exist. */
  adapter(name: string): OAuthProviderAdapter {
    const adapter = this.adapters.get(name as OAuthProvider);
    if (!adapter) throw new NotFoundException(`OAuth provider not enabled: ${name}`);
    return adapter;
  }

  async resolveProfile(profile: OAuthProfile, ip?: string): Promise<SanitizedUser> {
    const byIdentity = await this.users
      .findOne({
        'oauthIdentities.provider': profile.provider,
        'oauthIdentities.providerUserId': profile.providerUserId,
      })
      .exec();
    if (byIdentity) return this.loginExisting(byIdentity, profile, ip);

    const byEmail = profile.email
      ? await this.users.findOne({ email: profile.email }).exec()
      : null;

    if (byEmail) {
      if (!profile.emailVerified) {
        throw new ConflictException(
          'This email already has an account. Log in with your password to link the provider.',
        );
      }
      byEmail.oauthIdentities.push({
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        linkedAt: new Date(),
      });
      if (!byEmail.emailVerified) byEmail.emailVerified = true;
      await byEmail.save(); // unique identity index guards races → 409 via filter
      return this.loginExisting(byEmail, profile, ip, { linked: true });
    }

    const created = await this.users.create({
      email:
        profile.email ?? `${profile.provider}-${profile.providerUserId}@no-email.cvantage.invalid`,
      fullName: profile.fullName ?? 'New User',
      emailVerified: profile.emailVerified,
      avatarUrl: profile.avatarUrl,
      oauthIdentities: [
        {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          linkedAt: new Date(),
        },
      ],
    });
    await this.audit.record({
      action: AuditAction.USER_REGISTER,
      actorId: created._id,
      ip,
      meta: { provider: profile.provider },
    });
    return this.auth.sanitize(created);
  }

  private async loginExisting(
    user: UserDocument,
    profile: OAuthProfile,
    ip?: string,
    meta: Record<string, unknown> = {},
  ): Promise<SanitizedUser> {
    if (user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException('This account has been deactivated');
    }
    await this.users.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).exec();
    await this.audit.record({
      action: AuditAction.USER_LOGIN,
      actorId: user._id,
      ip,
      meta: { provider: profile.provider, ...meta },
    });
    return this.auth.sanitize(user);
  }
}
