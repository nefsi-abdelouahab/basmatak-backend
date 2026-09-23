import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { JobsKeyGuard } from './jobs-key.guard';

const SECRET = 'super-secret-jobs-key';

function header(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function contextWith(key: string | string[] | undefined): ExecutionContext {
  return header({
    header: (name: string) => (name === 'X-Jobs-Key' ? key : undefined),
  });
}

function errorOf(fn: () => boolean): {
  code: string;
  message: string;
  status: number;
} {
  try {
    fn();
  } catch (error) {
    const caught = error as { code: string; message: string; status: number };
    return {
      code: caught.code,
      message: caught.message,
      status: caught.status,
    };
  }
  throw new Error('expected the guard to throw');
}

describe('JobsKeyGuard (S19 constant-time key check)', () => {
  it('grants the exact key', () => {
    const guard = new JobsKeyGuard(new ConfigService({ JOBS_KEY: SECRET }));
    expect(guard.canActivate(contextWith(SECRET))).toBe(true);
  });

  it.each([['a totally wrong key'], ['almost-rig'], ['s'], [''], [undefined]])(
    'rejects a non-matching key (even length-different) with 401',
    (key) => {
      const guard = new JobsKeyGuard(new ConfigService({ JOBS_KEY: SECRET }));
      const error = errorOf(() => guard.canActivate(contextWith(key)));
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.status).toBe(401);
    },
  );

  it('rejects an array-valued header like any other mismatch', () => {
    const guard = new JobsKeyGuard(new ConfigService({ JOBS_KEY: SECRET }));
    const error = errorOf(() =>
      guard.canActivate(contextWith([SECRET, 'other'])),
    );
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('fails loudly with JOBS_KEY_MISSING when the server has no key', () => {
    const guard = new JobsKeyGuard(new ConfigService({}));
    const error = errorOf(() => guard.canActivate(contextWith(SECRET)));
    expect(error.code).toBe('JOBS_KEY_MISSING');
    expect(error.status).toBe(500);
  });
});
