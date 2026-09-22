import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { NotificationListQueryDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/**
 * Notifications controller (inventory §2.17, roadmap S9). Per-user screens:
 * every route reads/writes only the caller's rows; a foreign or absent row is
 * a 404 (inventory §6 non-owner-as-not-found convention).
 */
@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: "List the caller's notifications (newest first)" })
  list(
    @CurrentAccount() account: AccountToken,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notifications.list(account.sub, query.limit, query.cursor);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: "Count the caller's unread notifications" })
  unreadCount(@CurrentAccount() account: AccountToken) {
    return this.notifications.unreadCount(account.sub);
  }

  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(
    @CurrentAccount() account: AccountToken,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markRead(account.sub, notificationId);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all of the caller's notifications read" })
  readAll(@CurrentAccount() account: AccountToken) {
    return this.notifications.readAll(account.sub);
  }
}
