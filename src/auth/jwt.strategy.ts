import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountToken } from '../common/interfaces/account-token.interface';

export interface JwtPayload {
  sub: string;
  role: AccountToken['role'];
  sessionId: string;
}

/**
 * Resolves a signed access token into `req.user = { sub, role, sessionId }`
 * (design D3). The signature/expiry come from passport-jwt; SuspendedGuard and
 * EmailVerifiedGuard then enforce live account status from the DB.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
