import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { SystemSettingModel } from '../core/settings/system-setting.schema';
import { SettingsValueDto } from './dto/admin-part-b.dto';
import { AdminSettingsService } from './settings.service';

@ApiBearerAuth()
@ApiTags('admin (settings)')
@Controller('admin/settings')
@Roles('admin')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all system settings' })
  list(): Promise<SystemSettingModel[]> {
    return this.settings.list();
  }

  @ApiParam({
    name: 'key',
    description: 'System settings key',
    type: String,
  })
  @Put(':key')
  @ApiOperation({ summary: 'Upsert a known setting by key' })
  upsert(
    @Param('key') key: string,
    @Body() dto: SettingsValueDto,
  ): Promise<SystemSettingModel> {
    return this.settings.upsert(key, dto.value);
  }
}
