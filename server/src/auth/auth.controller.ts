import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';

import { AuthService } from './auth.service';
import { AuthUserDto, LoginDto, RegisterDto } from './dto/auth.dtos';

const USER_EXAMPLE = {
  id: '665f1c2d3e4f5a6b7c8d9e0f',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  role: 'candidate',
  emailVerified: false,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a candidate account',
    description:
      'Creates an account with email + password (argon2id-hashed). Email is unique ' +
      'case-insensitively. Password policy: at least 10 characters including lower, ' +
      'upper and digit. Session tokens are issued by POST /auth/login (#23).',
  })
  @ApiCreatedResponse({
    description: 'Account created (never includes the password hash)',
    type: AuthUserDto,
    example: USER_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  register(@Body() body: RegisterDto, @Ip() ip: string): Promise<AuthUserDto> {
    return this.auth.register(body as Required<RegisterDto>, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Verifies credentials with uniform timing and a single generic 401 for unknown ' +
      'email or wrong password (no account enumeration). Deactivated accounts receive ' +
      'an explicit 403. Token pair + httpOnly cookies are added by #23.',
  })
  @ApiOkResponse({
    description: 'Credentials valid — sanitized account profile',
    type: AuthUserDto,
    example: USER_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
  login(@Body() body: LoginDto, @Ip() ip: string): Promise<AuthUserDto> {
    return this.auth.login(body as Required<LoginDto>, ip);
  }
}
