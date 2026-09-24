import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { PatchNotificationPrefsDto } from './dto/notification-prefs.dto';
import { NotificationListQueryDto } from './dto/notification.dto';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationsService } from './notifications.service';

/**
 * Notifications controller (inventory §2.17, roadmap S9). Per-user screens:
 * every route reads/writes only the caller's rows; a foreign or absent row is
 * a 404 (inventory §6 non-owner-as-not-found convention).
 */
@ApiBearerAuth()
@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prefs: NotificationPrefsService,
  ) {}

  @Get('notifications/preferences')
  @ApiOperation({
    summary: "Get the caller's notification preferences (lazily seeded)",
  })
  async getPreferences(@CurrentAccount() account: AccountToken) {
    return { prefs: await this.prefs.getOwn(account.sub) };
  }

  @Patch('notifications/preferences')
  @ApiOperation({ summary: "Update the caller's notification preferences" })
  @ApiBody({ type: PatchNotificationPrefsDto })
  async patchPreferences(
    @CurrentAccount() account: AccountToken,
    @Body() dto: PatchNotificationPrefsDto,
  ) {
    return { prefs: await this.prefs.patchOwn(account.sub, dto.prefs) };
  }

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

  @ApiParam({
    name: 'notificationId',
    description: 'The notification id',
    type: String,
    format: 'ObjectId',
  })
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
