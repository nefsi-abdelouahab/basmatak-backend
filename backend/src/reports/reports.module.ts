import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { ReportSchema, ReportsCollection } from './report.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports module (inventory §2.19, module 21, roadmap S16 catch-up). Owns the
 * `reports` collection and the public POST /reports route; admin triage routes
 * live in AdminModule (design D1/D6). On boot it registers the `report` state
 * machine: open → in_review | resolved | dismissed, in_review → resolved | dismissed.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportsCollection, schema: ReportSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [MongooseModule],
})
export class ReportsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('report', [
      ['open', 'in_review'],
      ['open', 'resolved'],
      ['open', 'dismissed'],
      ['in_review', 'resolved'],
      ['in_review', 'dismissed'],
    ]);
  }
}
