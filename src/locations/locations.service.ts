import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { LocationModel, LocationsCollection } from './schemas/location.schema';

/**
 * Read + admin-maintenance service over `locations` (inventory §2.3).
 * Public reads are stable and ordered; municipal maintenance is admin-gated.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
  ) {}

  async findWilayas(): Promise<LocationModel[]> {
    return this.locationModel.find({ type: 'wilaya' }).sort({ code: 1 }).exec();
  }

  async findMunicipalities(wilayaCode: string): Promise<LocationModel[]> {
    const wilaya = await this.locationModel
      .findOne({ type: 'wilaya', code: wilayaCode })
      .exec();
    if (!wilaya) {
      throw new BusinessException(
        'LOCATION_NOT_FOUND',
        'Wilaya not found',
        404,
      );
    }
    return this.locationModel
      .find({ type: 'municipality', parentCode: wilayaCode })
      .sort({ code: 1 })
      .exec();
  }

  async create(dto: CreateLocationDto): Promise<LocationModel> {
    if (dto.type === 'municipality' && dto.parentCode === dto.code) {
      throw new BusinessException(
        'INVALID_PARENT_CODE',
        'A municipality cannot be its own parent wilaya',
        400,
      );
    }
    try {
      return await this.locationModel.create(dto);
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new BusinessException(
          'LOCATION_CODE_CONFLICT',
          'A location with this code already exists',
          409,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationModel> {
    const updated = await this.locationModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException(
        'LOCATION_NOT_FOUND',
        'Location not found',
        404,
      );
    }
    return updated;
  }
}
