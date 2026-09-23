import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  AddVolunteerSkillDto,
  UpdateVolunteerSkillDto,
} from './dto/volunteer-skill.dto';
import { VolunteerSkillModel } from './schemas/volunteer-skill.schema';
import { VolunteersService } from './volunteers.service';

@ApiBearerAuth()
@ApiTags('volunteers')
@Controller('volunteers/me/skills')
export class VolunteerSkillsController {
  constructor(private readonly volunteers: VolunteersService) {}

  @Get()
  @Roles('volunteer')
  @ApiOperation({ summary: 'List own skills' })
  async listMySkills(
    @CurrentAccount() account: AccountToken,
  ): Promise<VolunteerSkillModel[]> {
    return this.volunteers.listMySkills(account.sub);
  }

  @Post()
  @Roles('volunteer')
  @ApiOperation({ summary: 'Add a skill to own profile' })
  async addMySkill(
    @CurrentAccount() account: AccountToken,
    @Body() dto: AddVolunteerSkillDto,
  ): Promise<VolunteerSkillModel> {
    return this.volunteers.addSkill(account.sub, dto);
  }

  @ApiParam({
    name: 'skillId',
    description: 'The skill id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':skillId')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Update one of own skills' })
  async updateMySkill(
    @CurrentAccount() account: AccountToken,
    @Param('skillId') skillId: string,
    @Body() dto: UpdateVolunteerSkillDto,
  ): Promise<VolunteerSkillModel> {
    return this.volunteers.updateSkill(account.sub, skillId, dto);
  }

  @ApiParam({
    name: 'skillId',
    description: 'The skill id',
    type: String,
    format: 'ObjectId',
  })
  @Delete(':skillId')
  @Roles('volunteer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one of own skills' })
  async deleteMySkill(
    @CurrentAccount() account: AccountToken,
    @Param('skillId') skillId: string,
  ): Promise<void> {
    await this.volunteers.deleteSkill(account.sub, skillId);
  }
}
