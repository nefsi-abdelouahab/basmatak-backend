import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema, UsersCollection } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { MailModule } from '../mail/mail.module';
import { SessionSchema, SessionsCollection } from './schemas/session.schema';
import {
  VerificationTokenSchema,
  VerificationTokensCollection,
} from './schemas/verification-token.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { TokenUtil } from './token.util';

/**
 * Auth feature module: owns `sessions` + `verification_tokens` and hosts the
 * `users` model binding for this session (inventory §3/§4). Guards are wired
 * as APP_GUARDs from AppModule, in execution order.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UsersCollection, schema: UserSchema },
      { name: SessionsCollection, schema: SessionSchema },
      { name: VerificationTokensCollection, schema: VerificationTokenSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_ACCESS_SECRET is required. Set it in .env before booting the API.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m',
          },
        };
      },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    UsersService,
    AuthService,
    TokenUtil,
    JwtStrategy,
    JwtAuthGuard,
    EmailVerifiedGuard,
  ],
  exports: [UsersService, AuthService, TokenUtil],
})
export class AuthModule {}
