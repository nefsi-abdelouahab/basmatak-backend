import {
  Controller,
  Get,
  Param,
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
import { Roles } from '../common/decorators/auth.decorators';
import { CursorPage } from '../common/pagination/paginated.interface';
import { VolunteersQueryDto } from './dto/admin-query.dto';
import {
  AdminVolunteersService,
  AdminVolunteerRow,
} from './volunteers.service';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

@ApiBearerAuth()
@ApiTags('admin (volunteers)')
@Controller('admin/volunteers')
@Roles('admin')
export class AdminVolunteersController {
  constructor(private readonly volunteers: AdminVolunteersService) {}

  @Get()
  @ApiOperation({ summary: 'List volunteer profiles joined with their users' })
  async list(
    @Query() query: VolunteersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<AdminVolunteerRow> | StreamableFile> {
    const page = await this.volunteers.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('volunteers')}"`,
      );
      return new StreamableFile(adminCsvStream('volunteers', page.items));
    }
    return page;
  }

  @ApiParam({
    name: 'volunteerId',
    description: 'The volunteer user id',
    type: String,
    format: 'ObjectId',
  })
  @Get(':volunteerId/experiences')
  @ApiOperation({ summary: 'Latest verified engagement for one volunteer' })
  experiences(
    @Param('volunteerId') volunteerId: string,
  ): Promise<CursorPage<Record<string, unknown>>> {
    return this.volunteers.experiences(volunteerId);
  }
}
