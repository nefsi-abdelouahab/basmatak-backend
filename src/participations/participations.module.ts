import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { VolunteersModule } from '../volunteers/volunteers.module';
import { ParticipationsController } from './participations.controller';
import { ParticipationsService } from './participations.service';
import {
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from './schemas/task-participant.schema';

/**
 * Participations feature module (inventory §2.10, roadmap S7): "My Tasks".
 * Owns the `task_participants` schema — the accept transaction (applications
 * module) inserts rows here; the S6 startDate job activates raw rows of the
 * same collection. Registers the participant state machine whitelist.
 */
@Module({
  imports: [
    OpportunitiesModule,
    OrganizationsModule,
    VolunteersModule,
    MongooseModule.forFeature([
      { name: TaskParticipantsCollection, schema: TaskParticipantSchema },
    ]),
  ],
  controllers: [ParticipationsController],
  providers: [ParticipationsService],
  exports: [MongooseModule],
})
export class ParticipationsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('task_participant', [
      ['accepted', 'active'],
      // accepted|active → completed: verify (submissions S11 Part B) completes
      // a participant that was never activated by the S6 startDate job.
      ['accepted', 'completed'],
      ['active', 'completed'],
      ['accepted', 'withdrawn'],
      ['active', 'withdrawn'],
      ['accepted', 'removed'],
      ['active', 'removed'],
    ]);
  }
}
