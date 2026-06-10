import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

import { zodDto } from '../../common';

/**
 * Auth payload schemas (issue #22 / 2.1). Password policy: ≥10 chars with
 * lower, upper and digit — documented in Swagger and enforced by zod.
 * Moves into @cvantage/shared with #31 for client-side reuse.
 */
export const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a digit');

export const registerSchema = z.object({
  email: z.string().email().max(320),
  fullName: z.string().trim().min(1).max(200),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});

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

export class AuthUserDto {
  @ApiProperty({ example: '665f1c2d3e4f5a6b7c8d9e0f' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ example: 'Ada Lovelace' }) fullName!: string;
  @ApiProperty({ example: 'candidate', enum: ['candidate', 'admin'] }) role!: string;
  @ApiProperty({ example: false }) emailVerified!: boolean;
}
