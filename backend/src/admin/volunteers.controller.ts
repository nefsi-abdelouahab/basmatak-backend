import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CursorPage } from '../common/pagination/paginated.interface';
import { VolunteersQueryDto } from './dto/admin-query.dto';
import {
  AdminVolunteersService,
  AdminVolunteerRow,
} from './volunteers.service';

@ApiTags('admin (volunteers)')
@Controller('admin/volunteers')
@Roles('admin')
export class AdminVolunteersController {
  constructor(private readonly volunteers: AdminVolunteersService) {}

  @Get()
  @ApiOperation({ summary: 'List volunteer profiles joined with their users' })
  list(
    @Query() query: VolunteersQueryDto,
  ): Promise<CursorPage<AdminVolunteerRow>> {
    return this.volunteers.list(query);
  }
}
