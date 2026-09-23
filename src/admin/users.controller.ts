import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { UserModel } from '../users/schemas/user.schema';
import { UserStatusDto, UsersQueryDto } from './dto/admin-query.dto';
import { AdminUsersService } from './users.service';

@ApiBearerAuth()
@ApiTags('admin (users)')
@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with role/status/email filters' })
  list(@Query() query: UsersQueryDto): Promise<CursorPage<UserModel>> {
    return this.users.list(query);
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
    return this.users.setStatus(account, userId, dto.status);
  }
}
