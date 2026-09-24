import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  decodePageCursor,
  encodePageCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { CursorPage } from '../common/pagination/paginated.interface';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { ReportModel, ReportsCollection } from '../reports/report.schema';
import { ReportStatusDto, ReportsQueryDto } from './dto/admin-part-b.dto';

/**
 * Admin report triage (inventory §2.20): list the queue (filterable by
 * status, newest-first) and resolve/dismiss through the `report` whitelist.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
    private readonly statusTransitions: StatusTransitionService,
  ) {}

  async list(query: ReportsQueryDto): Promise<CursorPage<ReportModel>> {
    const limit = normalizeLimit(query.limit);
    const decoded = decodePageCursor(query.cursor);
    const page = decoded?.page ?? 1;
    const baseFilter: FilterQuery<ReportModel> = {};
    if (query.status) {
      baseFilter.status = query.status;
    }
    const pageFilter: FilterQuery<ReportModel> = { ...baseFilter };
    if (decoded?.id && Types.ObjectId.isValid(decoded.id)) {
      pageFilter._id = { $lt: new Types.ObjectId(decoded.id) };
    }
    const total = await this.reportModel.countDocuments(baseFilter).exec();
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const rows = await this.reportModel
      .find(pageFilter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return {
      items,
      nextCursor: lastId
        ? encodePageCursor({ id: lastId, page: page + 1, sort: 'newest' })
        : null,
      limit,
      total,
      page,
      pages,
    };
  }

  async resolve(
    account: AccountToken,
    reportId: string,
    dto: ReportStatusDto,
  ): Promise<ReportModel> {
    const report = await this.reportModel.findById(reportId).exec();
    if (!report) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    await this.statusTransitions.assert({
      entityType: 'report',
      entityId: report._id,
      from: report.status,
      to: dto.status,
      actor: account.sub,
    });
    await this.reportModel
      .updateOne(
        { _id: report._id },
        {
          $set: {
            status: dto.status,
            ...(dto.resolution ? { resolution: dto.resolution } : {}),
          },
        },
      )
      .exec();
    const updated = await this.reportModel.findById(report._id).exec();
    if (!updated) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    return updated;
  }
}
