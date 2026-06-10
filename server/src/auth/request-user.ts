import type { UserRole, UserStatus } from '../database/schemas';

/** The identity attached to every authenticated request (issue #24 / 2.3). */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
}
