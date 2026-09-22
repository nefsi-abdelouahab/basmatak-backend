import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { LocationsService } from './locations.service';
import { LocationModel } from './schemas/location.schema';

@ApiTags('locations (admin)')
@Controller('admin/locations')
@Roles('admin')
export class AdminLocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a wilaya or municipality' })
  create(@Body() dto: CreateLocationDto): Promise<LocationModel> {
    return this.locations.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a location's editable fields" })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationModel> {
    return this.locations.update(id, dto);
  }
}
