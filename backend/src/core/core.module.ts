import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from './status-transitions/status-histories.schema';
import { StatusTransitionRegistry } from './status-transitions/status-transition.registry';
import { StatusTransitionService } from './status-transitions/status-transition.service';
import { AuditLogsCollection, AuditLogSchema } from './audit/audit-log.schema';
import { AuditInterceptor } from './audit/audit.interceptor';
import {
  SystemSettingsCollection,
  SystemSettingSchema,
} from './settings/system-setting.schema';
import { SettingsService } from './settings/settings.service';
import { JobRegistry } from './jobs/job-registry';
import { JobsService } from './jobs/jobs.service';
import { JobsKeyGuard } from './jobs/jobs-key.guard';
import { InternalJobsController } from './jobs/internal-jobs.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { SystemController } from './system/system.controller';

/**
 * Core (inventory §1 modules 1/2/23): status transitions + `status_histories`,
 * audit interceptor + `audit_logs`, settings + `system_settings`, and the
 * internal jobs runner.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StatusHistoryCollection, schema: StatusHistorySchema },
      { name: AuditLogsCollection, schema: AuditLogSchema },
      { name: SystemSettingsCollection, schema: SystemSettingSchema },
    ]),
  ],
  controllers: [InternalJobsController, SystemController],
  providers: [
    StatusTransitionRegistry,
    StatusTransitionService,
    SettingsService,
    MaintenanceService,
    JobRegistry,
    { provide: 'JobRegistry', useExisting: JobRegistry },
    JobsService,
    JobsKeyGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [
    StatusTransitionRegistry,
    StatusTransitionService,
    SettingsService,
    MaintenanceService,
    JobRegistry,
  ],
})
export class CoreModule {}
