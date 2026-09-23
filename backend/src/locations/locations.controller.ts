import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { setReferenceCacheHeader } from '../common/http/cache-header';
import { SettingsService } from '../core/settings/settings.service';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly settings: SettingsService,
  ) {}

  @Get('wilayas')
  @Public()
  @ApiOperation({ summary: 'List all 58 wilayas, ordered by code' })
  async getWilayas(@Res({ passthrough: true }) res: Response) {
    await setReferenceCacheHeader(res, this.settings);
    return this.locations.findWilayas();
  }

  @ApiParam({
    name: 'wilayaId',
    description: 'Wilaya code (2 digits)',
    type: String,
    example: '16',
  })
  @Get('wilayas/:wilayaId/municipalities')
  @Public()
  @ApiOperation({ summary: "List a wilaya's municipalities, ordered by code" })
  async getMunicipalities(
    @Param('wilayaId') wilayaId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await setReferenceCacheHeader(res, this.settings);
    return this.locations.findMunicipalities(wilayaId);
  }
}
