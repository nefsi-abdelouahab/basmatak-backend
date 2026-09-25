import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { CommonModule } from './common/common.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { SkillsModule } from './skills/skills.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { ApplicationsModule } from './applications/applications.module';
import { ParticipationsModule } from './participations/participations.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { ReviewsModule } from './reviews/reviews.module';
import { VerificationsModule } from './verifications/verifications.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { ActivityModule } from './activity/activity.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppValidationPipe } from './common/pipes/validation.pipe';
import { SuspendedGuard } from './common/guards/suspended.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MaintenanceGuard } from './core/maintenance/maintenance.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './auth/guards/email-verified.guard';

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/basmatak';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI') ?? DEFAULT_MONGO_URI,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (Number(config.get<number>('THROTTLE_TTL', 60)) || 60) * 1000,
            limit: Number(config.get<number>('THROTTLE_LIMIT', 100)) || 100,
          },
        ],
      }),
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      global: true,
    }),
    CommonModule,
    CoreModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    SkillsModule,
    OpportunitiesModule,
    OrganizationsModule,
    VolunteersModule,
    ApplicationsModule,
    ParticipationsModule,
    MediaModule,
    NotificationsModule,
    SubmissionsModule,
    ReviewsModule,
    VerificationsModule,
    PortfolioModule,
    ReportsModule,
    AdminModule,
    ActivityModule,
  ],
  controllers: [AppController, HealthController],
  // Global guards execute in the order declared: JWT identity first, then
  // live status, then the email gate, then roles, then rate limiting.
  providers: [
    AppService,
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SuspendedGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
