import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { UpdateAvailabilityDto } from './dto/volunteer-availability.dto';
import { WeeklySchedule } from './schemas/volunteer-availability.schema';
import { VolunteersService } from './volunteers.service';

@ApiBearerAuth()
@ApiTags('volunteers')
@Controller('volunteers/me/availability')
export class VolunteerAvailabilityController {
  constructor(private readonly volunteers: VolunteersService) {}

  @Get()
  @Roles('volunteer')
  @ApiOperation({ summary: 'Read own weekly availability' })
  async getMyAvailability(
    @CurrentAccount() account: AccountToken,
  ): Promise<WeeklySchedule> {
    return this.volunteers.getAvailability(account.sub);
  }

  @Put()
  @Roles('volunteer')
  @ApiOperation({ summary: 'Replace own weekly availability' })
  async replaceMyAvailability(
    @CurrentAccount() account: AccountToken,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<WeeklySchedule> {
    return this.volunteers.setAvailability(account.sub, dto);
  }
}
