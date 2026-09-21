import {
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createSchema } from '../../src/common/schema/base.schema';

/**
 * Test-only probe module used by e2e tests to exercise core error handling
 * (unknown ObjectId -> 400 INVALID_ID). Never part of the application.
 */

export const ProbeDocumentCollection = 'ProbeDocument';

export const ProbeDocumentSchema = createSchema(
  { label: { type: String, required: true } },
  { collection: 'probe_documents' },
);

@Controller('probe')
class ProbeController {
  constructor(
    @InjectModel(ProbeDocumentCollection)
    private readonly model: Model<any>,
  ) {}

  @Get('docs/:id')
  async findById(@Param('id') id: string) {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Probe document not found');
    }
    return doc;
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProbeDocumentCollection, schema: ProbeDocumentSchema },
    ]),
  ],
  controllers: [ProbeController],
})
export class ProbeModule {}
