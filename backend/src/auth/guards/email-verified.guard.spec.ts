import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators/auth.decorators';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { UsersService } from '../../users/users.service';

function makeContext(user: AccountToken | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
function handler(): void {}

describe('EmailVerifiedGuard', () => {
  function makeUsers(
    status: 'verified' | 'unverified' | 'missing',
  ): UsersService {
    return {
      findById: jest.fn().mockImplementation(async () => {
        if (status === 'missing') {
          return null;
        }
        return {
          emailVerifiedAt: status === 'verified' ? new Date() : undefined,
          status: 'active',
        };
      }),
    } as unknown as UsersService;
  }

  it('blocks an unverified account when the flag is on', async () => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, false, handler);
    const guard = new EmailVerifiedGuard(
      new ConfigService({ EMAIL_VERIFICATION_REQUIRED: 'true' }),
      new Reflector(),
      makeUsers('unverified'),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: 'u1', role: 'volunteer', sessionId: 's1' }),
      ),
    ).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
  });

  it('allows a verified account when the flag is on', async () => {
    const guard = new EmailVerifiedGuard(
      new ConfigService({ EMAIL_VERIFICATION_REQUIRED: 'true' }),
      new Reflector(),
      makeUsers('verified'),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: 'u1', role: 'volunteer', sessionId: 's1' }),
      ),
    ).resolves.toBe(true);
  });

  it('allows unverified accounts when the flag is off', async () => {
    const guard = new EmailVerifiedGuard(
      new ConfigService({ EMAIL_VERIFICATION_REQUIRED: 'false' }),
      new Reflector(),
      makeUsers('unverified'),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: 'u1', role: 'volunteer', sessionId: 's1' }),
      ),
    ).resolves.toBe(true);
  });

  it('skips public routes', async () => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
    const guard = new EmailVerifiedGuard(
      new ConfigService({ EMAIL_VERIFICATION_REQUIRED: 'true' }),
      new Reflector(),
      makeUsers('unverified'),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: 'u1', role: 'volunteer', sessionId: 's1' }),
      ),
    ).resolves.toBe(true);
  });
});
