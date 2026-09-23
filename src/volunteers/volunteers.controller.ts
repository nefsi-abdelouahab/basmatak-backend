import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  UpdatePublicSettingsDto,
  UpdateVolunteerProfileDto,
} from './dto/volunteer-profile.dto';
import { VolunteerDashboard, VolunteersService } from './volunteers.service';
import { VolunteerProfileModel } from './schemas/volunteer-profile.schema';

@ApiBearerAuth()
@ApiTags('volunteers')
@Controller('volunteers')
export class VolunteersController {
  constructor(private readonly volunteers: VolunteersService) {}

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Read own volunteer profile' })
  async getMyProfile(
    @CurrentAccount() account: AccountToken,
  ): Promise<VolunteerProfileModel> {
    return this.volunteers.getMyProfile(account.sub);
  }

  @Patch('me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Update own volunteer profile' })
  async updateMyProfile(
    @CurrentAccount() account: AccountToken,
    @Body() dto: UpdateVolunteerProfileDto,
  ): Promise<VolunteerProfileModel> {
    return this.volunteers.updateProfile(account.sub, dto);
  }

  @Patch('me/public-settings')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Update public-profile privacy flags' })
  async updatePublicSettings(
    @CurrentAccount() account: AccountToken,
    @Body() dto: UpdatePublicSettingsDto,
  ): Promise<VolunteerProfileModel> {
    return this.volunteers.updatePublicSettings(account.sub, dto);
  }

  @Get('me/dashboard')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Read own volunteer dashboard' })
  async getMyDashboard(
    @CurrentAccount() account: AccountToken,
  ): Promise<VolunteerDashboard> {
    return this.volunteers.getDashboard(account.sub);
  }
}
