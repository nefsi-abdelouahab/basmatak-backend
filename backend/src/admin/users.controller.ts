import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { UserModel } from '../users/schemas/user.schema';
import { UserStatusDto, UsersQueryDto } from './dto/admin-query.dto';
import { AdminNoticeDto } from './dto/moderation-action.dto';
import { AdminUsersService } from './users.service';
import { ModerationActionsService } from './moderation-actions.service';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

@ApiBearerAuth()
@ApiTags('admin (users)')
@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly moderation: ModerationActionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users with role/status/email filters' })
  async list(
    @Query() query: UsersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<UserModel> | StreamableFile> {
    const page = await this.users.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('users')}"`,
      );
      return new StreamableFile(adminCsvStream('users', page.items));
    }
    return page;
  }

  @ApiParam({
    name: 'userId',
    description: 'The user id',
    type: String,
    format: 'ObjectId',
  })
  @Get(':userId')
  @ApiOperation({ summary: 'User detail (no password hash)' })
  getById(@Param('userId') userId: string): Promise<UserModel> {
    return this.users.getById(userId);
  }

  @ApiParam({
    name: 'userId',
    description: 'The user id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':userId/status')
  @ApiOperation({ summary: 'Suspend or reinstate a user account' })
  setStatus(
    @CurrentAccount() account: AccountToken,
    @Param('userId') userId: string,
    @Body() dto: UserStatusDto,
  ): Promise<UserModel> {
    return this.users.setStatus(account, userId, dto.status, {
      reason: dto.reason,
      notes: dto.notes,
    });
  }

  @ApiParam({
    name: 'userId',
    description: 'The user id',
    type: String,
    format: 'ObjectId',
  })
  @Post(':userId/notice')
  @ApiOperation({ summary: 'Send a neutral system notice to a user' })
  sendNotice(
    @Param('userId') userId: string,
    @Body() dto: AdminNoticeDto,
  ): Promise<{ delivered: boolean }> {
    return this.moderation.sendNotice(userId, dto.message);
  }
}
