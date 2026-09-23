import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { AdminReportsService } from '../admin/reports.service';
import { ReportModel, ReportsCollection, ReportSchema } from './report.schema';
import { ReportsService } from './reports.service';

const REPORT_PAIRS = [
  ['open', 'in_review'],
  ['open', 'resolved'],
  ['open', 'dismissed'],
  ['in_review', 'resolved'],
  ['in_review', 'dismissed'],
] as const;

describe('ReportsService (inventory §2.19, module 21)', () => {
  let handle: MemoryConnectionHandle;
  let reportModel: Model<ReportModel>;
  let historyModel: Model<StatusHistoryModel>;
  let create: ReportsService;
  let resolve: AdminReportsService;

  const reporter: AccountToken = {
    sub: '507f1f77bcf86cd799439011',
    role: 'volunteer',
    sessionId: '507f1f77bcf86cd799439012',
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    reportModel = handle.connection.model(ReportsCollection, ReportSchema);
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('report', REPORT_PAIRS);
    const transitions = new StatusTransitionService(historyModel, registry);
    create = new ReportsService(reportModel);
    resolve = new AdminReportsService(reportModel, transitions);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(ReportsCollection).deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
  });

  it('creates a report with the reporter id and status open', async () => {
    const targetId = new Types.ObjectId().toString();
    const report = await create.create(reporter, {
      targetType: 'organization',
      targetId,
      reason: 'Suspicious organisation activity',
      description: 'Seen posting fake opportunities',
    });

    expect(report.reporterId.toString()).toBe(reporter.sub);
    expect(report.status).toBe('open');
    expect(report.targetType).toBe('organization');
    expect(report.targetId.toString()).toBe(targetId);
    expect(report.reason).toBe('Suspicious organisation activity');
    expect(report.description).toBe('Seen posting fake opportunities');
  });

  it('creates a report without an optional description', async () => {
    const report = await create.create(reporter, {
      targetType: 'user',
      targetId: new Types.ObjectId().toString(),
      reason: 'Abusive messages',
    });
    expect(report.status).toBe('open');
    expect(report.description).toBeUndefined();
  });

  describe('report status flow (open → in_review → resolved/dismissed)', () => {
    it('accepts open → in_review and in_review → resolved', async () => {
      const report = await create.create(reporter, {
        targetType: 'review',
        targetId: new Types.ObjectId().toString(),
        reason: 'Harassment',
      });

      const inReview = await resolve.resolve(reporter, report._id.toString(), {
        status: 'in_review',
      });
      expect(inReview.status).toBe('in_review');

      const resolved = await resolve.resolve(reporter, report._id.toString(), {
        status: 'resolved',
        resolution: 'Warned the reviewer',
      });
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBe('Warned the reviewer');

      expect(await historyModel.countDocuments({}).exec()).toBe(2);
    });

    it('accepts open → dismissed', async () => {
      const report = await create.create(reporter, {
        targetType: 'submission',
        targetId: new Types.ObjectId().toString(),
        reason: 'False claim',
      });
      const dismissed = await resolve.resolve(reporter, report._id.toString(), {
        status: 'dismissed',
      });
      expect(dismissed.status).toBe('dismissed');
    });

    it('rejects resolved → open and no-op transitions with 409 and no history row', async () => {
      const report = await create.create(reporter, {
        targetType: 'opportunity',
        targetId: new Types.ObjectId().toString(),
        reason: 'Scam posting',
      });
      await resolve.resolve(reporter, report._id.toString(), {
        status: 'resolved',
      });

      await expect(
        resolve.resolve(reporter, report._id.toString(), {
          status: 'in_review',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });

      expect(await historyModel.countDocuments({}).exec()).toBe(1);
    });

    it('404s when the report is absent', async () => {
      await expect(
        resolve.resolve(reporter, '507f1f77bcf86cd799439099', {
          status: 'in_review',
        }),
      ).rejects.toMatchObject({ status: 404, code: 'REPORT_NOT_FOUND' });
    });
  });
});
