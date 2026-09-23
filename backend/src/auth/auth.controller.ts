import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Public } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { AuthService, AuthTokens } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

/** 5 login attempts per minute (brute-force hardening). */
const LOGIN_LIMIT = { default: { limit: 5, ttl: 60_000 } };
/** 3 attempts per hour on silent/account-enumeration-prone endpoints. */
const SLOW_LIMIT = { default: { limit: 3, ttl: 3_600_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/volunteer')
  @Public()
  @ApiOperation({ summary: 'Register a volunteer account' })
  registerVolunteer(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.authService.register('volunteer', dto);
  }

  @Post('register/organization')
  @Public()
  @ApiOperation({ summary: 'Register an organization account' })
  registerOrganization(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.authService.register('organization', dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_LIMIT)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token into a new token pair' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentAccount() account: AccountToken): Promise<void> {
    await this.authService.logout(account.sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session of the caller' })
  async logoutAll(@CurrentAccount() account: AccountToken): Promise<void> {
    await this.authService.logoutAll(account.sub);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Consume an email verification token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(SLOW_LIMIT)
  @ApiOperation({
    summary: 'Invalidate prior tokens and resend a verification email',
  })
  async resendVerification(
    @CurrentAccount() account: AccountToken,
  ): Promise<void> {
    await this.authService.resendVerification(account.sub);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(SLOW_LIMIT)
  @ApiOperation({ summary: 'Initiate a password reset (always 204)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Consume a reset token and set a new password' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change the current password, revoking other sessions',
  })
  async changePassword(
    @CurrentAccount() account: AccountToken,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      account.sub,
      account.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Current account (user + role, org block in S5)' })
  me(@CurrentAccount() account: AccountToken) {
    return this.authService.me(account.sub);
  }
}
