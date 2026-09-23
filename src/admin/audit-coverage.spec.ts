import { Model } from 'mongoose';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  AuditLogModel,
  AuditLogSchema,
  AuditLogsCollection,
} from '../core/audit/audit-log.schema';
import { AuditInterceptor } from '../core/audit/audit.interceptor';

const ADMIN_SUB = '507f1f77bcf86cd799439011';

function fakeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const callHandler: CallHandler = { handle: () => of('ok') };

async function waitFor(
  probe: () => Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for audit row');
}

describe('AuditInterceptor admin coverage (inventory §2.20)', () => {
  let handle: MemoryConnectionHandle;
  let auditModel: Model<AuditLogModel>;
  let interceptor: AuditInterceptor;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    auditModel = handle.connection.model(AuditLogsCollection, AuditLogSchema);
    interceptor = new AuditInterceptor(auditModel);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(AuditLogsCollection).deleteMany({});
  });

  it('records an admin action for GET /admin/users', async () => {
    await lastValueFrom(
      interceptor.intercept(
        fakeContext({
          method: 'GET',
          url: '/api/v1/admin/users?role=volunteer',
          token: { sub: ADMIN_SUB, role: 'admin', sessionId: 's' },
          ip: '127.0.0.1',
          headers: {},
        }),
        callHandler,
      ),
    );

    await waitFor(
      async () => (await auditModel.countDocuments({}).exec()) === 1,
    );
    const row = await auditModel.findOne({}).exec();
    expect(row).toMatchObject({
      actorId: expect.anything(),
      action: 'admin',
      method: 'GET',
      path: '/api/v1/admin/users?role=volunteer',
    });
  });

  it('records an admin mutation for PATCH /admin/users/:userId/status', async () => {
    await lastValueFrom(
      interceptor.intercept(
        fakeContext({
          method: 'PATCH',
          url: '/api/v1/admin/users/507f1f77bcf86cd799439013/status',
          token: { sub: ADMIN_SUB, role: 'admin', sessionId: 's' },
          ip: '127.0.0.1',
          headers: { 'user-agent': 'jest' },
        }),
        callHandler,
      ),
    );

    await waitFor(
      async () => (await auditModel.countDocuments({}).exec()) === 1,
    );
    const row = await auditModel.findOne({}).exec();
    expect(row).toMatchObject({
      action: 'admin',
      method: 'PATCH',
      path: '/api/v1/admin/users/507f1f77bcf86cd799439013/status',
    });
  });

  it('does not audit a plain non-admin public read', async () => {
    await lastValueFrom(
      interceptor.intercept(
        fakeContext({
          method: 'GET',
          url: '/api/v1/opportunities',
          token: undefined,
          ip: '127.0.0.1',
          headers: {},
        }),
        callHandler,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await auditModel.countDocuments({}).exec()).toBe(0);
  });

  it.each([
    ['PATCH', '/api/v1/organizations/507f1f77bcf86cd799439020'],
    ['DELETE', '/api/v1/volunteers/507f1f77bcf86cd799439021'],
    // Reliability/gate write surface: submission status changes (S19).
    ['PATCH', '/api/v1/submissions/507f1f77bcf86cd799439022/status'],
  ])('audits the §0 sensitive mutation %s %s', async (method, url) => {
    await lastValueFrom(
      interceptor.intercept(
        fakeContext({
          method,
          url,
          token: { sub: ADMIN_SUB, role: 'organization', sessionId: 's' },
          ip: '10.0.0.1',
          headers: { 'user-agent': 'jest' },
        }),
        callHandler,
      ),
    );

    await waitFor(
      async () => (await auditModel.countDocuments({}).exec()) === 1,
    );
    const row = await auditModel.findOne({}).exec();
    expect(row).toMatchObject({ action: method, method, path: url });
  });

  it('audits an admin candidate approval', async () => {
    await lastValueFrom(
      interceptor.intercept(
        fakeContext({
          method: 'POST',
          url: '/api/v1/admin/organizations/507f1f77bcf86cd799439023/approve',
          token: { sub: ADMIN_SUB, role: 'admin', sessionId: 's' },
          ip: '10.0.0.2',
          headers: {},
        }),
        callHandler,
      ),
    );

    await waitFor(
      async () => (await auditModel.countDocuments({}).exec()) === 1,
    );
    const row = await auditModel.findOne({}).exec();
    expect(row).toMatchObject({
      action: 'admin',
      method: 'POST',
      path: '/api/v1/admin/organizations/507f1f77bcf86cd799439023/approve',
    });
  });
});
