import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { ReportModel, ReportsCollection } from './report.schema';
import { CreateReportDto } from './dto/create-report.dto';

/**
 * Reports service (inventory §2.19, module 21). Creates user-submitted reports
 * (storing the reporter) and, for the admin module, lists and resolves them.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
  ) {}

  async create(
    account: AccountToken,
    dto: CreateReportDto,
  ): Promise<ReportModel> {
    return this.reportModel.create({
      reporterId: new Types.ObjectId(account.sub),
      targetType: dto.targetType,
      targetId: new Types.ObjectId(dto.targetId),
      reason: dto.reason,
      ...(dto.description ? { description: dto.description } : {}),
      ...(dto.title ? { title: dto.title } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      status: 'open',
    });
  }
}
