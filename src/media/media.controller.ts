import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentAccount, Public } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { PostLinkMediaDto, PostUploadMediaDto } from './dto/media.dto';
import { MediaService } from './media.service';

const UPLOAD_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const LINK_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const CONFIRM_LIMIT = { default: { limit: 60, ttl: 60_000 } };

/**
 * Media controller (inventory §2.11, roadmap S8). `GET /:mediaId` is `@Public`
 * so guests are answered `404` inside the service rather than `401`, per the
 * "public 404 unless auth" read contract; every other route requires a token.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @Throttle(UPLOAD_LIMIT)
  @ApiOperation({ summary: 'Request a presigned upload URL (intent)' })
  createUpload(
    @CurrentAccount() account: AccountToken,
    @Body() dto: PostUploadMediaDto,
  ) {
    return this.media.createUploadIntent(account.sub, dto);
  }

  @Post(':mediaId/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle(CONFIRM_LIMIT)
  @ApiOperation({ summary: 'Confirm an upload by re-reading storage metadata' })
  confirm(
    @CurrentAccount() account: AccountToken,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.confirm(account, mediaId);
  }

  @Post('links')
  @Throttle(LINK_LIMIT)
  @ApiOperation({ summary: 'Register an external link as media' })
  createLink(
    @CurrentAccount() account: AccountToken,
    @Body() dto: PostLinkMediaDto,
  ) {
    return this.media.createLink(account, dto);
  }

  @Get(':mediaId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Read media metadata + signed URL (visibility-gated)',
  })
  read(
    @CurrentAccount() account: AccountToken | undefined,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.read(account, mediaId);
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete owned media (F6 guard)' })
  async remove(
    @CurrentAccount() account: AccountToken,
    @Param('mediaId') mediaId: string,
  ) {
    await this.media.softDelete(account, mediaId);
  }
}
