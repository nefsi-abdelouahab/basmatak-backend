import { Types } from 'mongoose';
import { MediaDeletionPolicy } from './deletion-policy';
import { MediaModel } from './schemas/media.schema';

function row(id: Types.ObjectId | undefined): MediaModel {
  return {
    _id: id ?? new Types.ObjectId(),
    ownerId: new Types.ObjectId(),
    type: 'file',
    ...(id ? { submissionId: id } : {}),
  } as MediaModel;
}

describe('MediaDeletionPolicy (conservative default until S10/S11)', () => {
  const policy = new MediaDeletionPolicy();

  it('allows deleting unattached rows', async () => {
    await expect(
      policy.assertDeletable(row(undefined)),
    ).resolves.toBeUndefined();
  });

  it('blocks deleting rows attached to a submission or portfolio item', async () => {
    await expect(
      policy.assertDeletable(row(new Types.ObjectId())),
    ).rejects.toMatchObject({
      status: 409,
      code: 'MEDIA_DELETION_BLOCKED',
    });
    await expect(
      policy.assertDeletable({
        ...row(new Types.ObjectId()),
        portfolioItemId: new Types.ObjectId(),
      } as MediaModel),
    ).rejects.toMatchObject({
      status: 409,
      code: 'MEDIA_DELETION_BLOCKED',
    });
  });
});
