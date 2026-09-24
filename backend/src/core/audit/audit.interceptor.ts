import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable, tap } from 'rxjs';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import {
  AuditLogEntry,
  AuditLogModel,
  AuditLogsCollection,
} from './audit-log.schema';

const SENSITIVE_PREFIXES = [
  '/api/v1/organizations/',
  '/api/v1/volunteers/',
  // Submissions status changes recompute the reliability score and the
  // publish-gate counts (§0 sensitive list; S19 audit posture).
  '/api/v1/submissions/',
];

/**
 * Writes `audit_logs` for every admin action and for PATCH/DELETE on
 * organization and volunteer resources (inventory §0, §2.20, roadmap S1).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(AuditLogsCollection)
    private readonly auditModel: Model<AuditLogModel>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(tap(() => void this.writeAudit(context)));
  }

  private async writeAudit(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      token?: AccountToken;
      user?: AccountToken;
      ip?: string;
      headers?: Record<string, string | undefined>;
    }>();

    const method = request.method.toUpperCase();
    const path = request.originalUrl ?? request.url ?? '';
    // The JWT strategy attaches the account as `req.user`; `req.token` is kept
    // as a fallback for direct/unit invocations and older flows.
    const account = (request.user ?? request.token) as AccountToken | undefined;
    const isAdminAction =
      account?.role === 'admin' || path.startsWith('/api/v1/admin');
    const isSensitiveMutation =
      (method === 'PATCH' || method === 'DELETE') &&
      SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix));

    if (!isAdminAction && !isSensitiveMutation) {
      return;
    }

    const entry = this.resolveEntity(path);
    const actorId = account?.sub ? new Types.ObjectId(account.sub) : null;

    const doc: AuditLogEntry = {
      actorId,
      action: isAdminAction ? 'admin' : method,
      method,
      path,
      entityType: entry?.entityType,
      entityId: entry?.entityId ? new Types.ObjectId(entry.entityId) : null,
      ip: request.ip ?? null,
      userAgent: request.headers?.['user-agent'] ?? null,
    };
    await this.auditModel.create(doc);
  }

  /** Best-effort `(entityType, entityId)` extraction from the path. */
  private resolveEntity(
    path: string,
  ): { entityType: string; entityId: string } | null {
    const segments = path.split('/').filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      if (
        segment === 'organizations' ||
        segment === 'volunteers' ||
        segment === 'opportunities' ||
        segment === 'applications' ||
        segment === 'submissions' ||
        segment === 'reports'
      ) {
        const next = segments[i + 1];
        if (next && next !== 'me' && Types.ObjectId.isValid(next)) {
          return { entityType: segment, entityId: next };
        }
      }
    }
    return null;
  }
}
