import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessException } from '../common/exceptions/business.exception';
import { CurrentAccount } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { AuthService, UserPayload } from '../auth/auth.service';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-user.dto';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Read own account' })
  async getMe(@CurrentAccount() account: AccountToken): Promise<UserPayload> {
    return this.auth.me(account.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own contact fields (email/phone only)' })
  async updateMe(
    @CurrentAccount() account: AccountToken,
    @Body() dto: UpdateMeDto,
  ): Promise<UserPayload> {
    const contactChanged = dto.email !== undefined || dto.phone !== undefined;
    await this.users.updateContact(account.sub, dto);
    if (contactChanged) {
      await this.auth.resendVerification(account.sub);
    }
    return this.auth.me(account.sub);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete own account and revoke all sessions' })
  async deleteMe(@CurrentAccount() account: AccountToken): Promise<void> {
    await this.users.softDelete(account.sub);
    await this.auth.logoutAll(account.sub);
  }

  @Get('me/sessions')
  @ApiOperation({ summary: "List the caller's own active sessions" })
  listSessions(@CurrentAccount() account: AccountToken) {
    return this.auth.listSessions(account.sub, account.sessionId);
  }

  @ApiParam({
    name: 'sessionId',
    description: 'The session id',
    type: String,
    format: 'ObjectId',
  })
  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke one of the caller's own sessions" })
  async revokeSession(
    @CurrentAccount() account: AccountToken,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    const removed = await this.auth.removeSession(account.sub, sessionId);
    if (!removed) {
      throw new BusinessException(
        'SESSION_NOT_FOUND',
        'Session not found',
        404,
      );
    }
  }
}
