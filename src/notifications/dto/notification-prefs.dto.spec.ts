import { AppValidationPipe } from '../../common/pipes/validation.pipe';
import {
  NotificationPrefsDto,
  PatchNotificationPrefsDto,
} from './notification-prefs.dto';

const pipe = new AppValidationPipe();

function transform(body: Record<string, unknown>): Promise<unknown> {
  return pipe.transform(
    body as never,
    {
      type: 'body',
      metatype: PatchNotificationPrefsDto,
    } as never,
  );
}

describe('PatchNotificationPrefsDto validation (S3, task 5.4)', () => {
  it('accepts a partial one-key patch', async () => {
    const value = (await transform({
      prefs: { digest: false },
    })) as { prefs: NotificationPrefsDto };

    expect(value.prefs.digest).toBe(false);
    expect(value.prefs.applicationUpdates).toBeUndefined();
  });

  it('accepts a full six-key update', async () => {
    const all = {
      applicationUpdates: false,
      reviews: true,
      verification: true,
      system: true,
      digest: false,
      recordIssued: true,
    };
    const value = (await transform({ prefs: all })) as {
      prefs: NotificationPrefsDto;
    };

    expect(value.prefs).toMatchObject(all);
  });

  it('accepts an empty patch (no-op)', async () => {
    const value = (await transform({ prefs: {} })) as {
      prefs: NotificationPrefsDto;
    };
    expect(value.prefs).toBeInstanceOf(NotificationPrefsDto);
  });

  it('rejects an unknown pref key with 400', async () => {
    await expect(
      transform({ prefs: { emailDigest: true } }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a non-boolean value with 400', async () => {
    await expect(transform({ prefs: { system: 'yes' } })).rejects.toMatchObject(
      {
        status: 400,
        code: 'VALIDATION_ERROR',
      },
    );
  });

  it('rejects a missing prefs object with 400', async () => {
    await expect(transform({})).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
