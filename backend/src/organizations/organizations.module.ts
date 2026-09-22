import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { OrganizationRegistrationExtrasService } from './organization-registration-extras.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationSchema,
} from './schemas/organization-verification.schema';

/**
 * Organizations feature module (inventory §2.7): the org page, `/me`
 * internals and the verification-document flow. Registers the `organization`
 * verification-status machine (`pending → verified | rejected → pending`) so
 * status histories are written on resubmission; S15 drives `→ verified|rejected`.
 * MongooseModule is exported for S15/S17 reuse.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: OrganizationsCollection, schema: OrganizationSchema },
      {
        name: OrganizationVerificationsCollection,
        schema: OrganizationVerificationSchema,
      },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationRegistrationExtrasService],
  exports: [MongooseModule, OrganizationsService],
})
export class OrganizationsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('organization', [
      ['pending', 'verified'],
      ['pending', 'rejected'],
      ['rejected', 'pending'],
    ]);
  }
}
