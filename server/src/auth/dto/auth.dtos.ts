import {
  loginSchema as sharedLogin,
  passwordSchema,
  registerSchema as sharedRegister,
} from '@cvantage/shared';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

import { zodDto } from '../../common';

/**
 * Auth payload DTOs (issues #22/#23). The zod schemas themselves live in
 * @cvantage/shared (#31) so client forms validate identically.
 */
export { passwordSchema };

export const registerSchema = sharedRegister;

export const loginSchema = sharedLogin;

export class RegisterDto extends zodDto(registerSchema) {
  @ApiProperty({ example: 'ada@example.com', maxLength: 320 }) email!: string;
  @ApiProperty({ example: 'Ada Lovelace', maxLength: 200 }) fullName!: string;
  @ApiProperty({
    example: 'Difference-Engine-42',
    description: '≥10 chars with lower, upper and digit',
  })
  password!: string;
}

export class LoginDto extends zodDto(loginSchema) {
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ example: 'Difference-Engine-42' }) password!: string;
}

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(20).optional(),
  })
  .default({});

export class RefreshDto extends zodDto(refreshSchema) {
  @ApiProperty({
    required: false,
    description: 'Only for non-browser clients — browsers use the httpOnly cookie',
    example: 'pXg1u9…base64url…',
  })
  refreshToken?: string;
}

export class AuthUserDto {
  @ApiProperty({ example: '665f1c2d3e4f5a6b7c8d9e0f' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ example: 'Ada Lovelace' }) fullName!: string;
  @ApiProperty({ example: 'candidate', enum: ['candidate', 'admin'] }) role!: string;
  @ApiProperty({ example: false }) emailVerified!: boolean;
}

export class SessionDto {
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
  @ApiProperty({ description: 'JWT for Authorization: Bearer — also set as httpOnly cookie' })
  accessToken!: string;
}
