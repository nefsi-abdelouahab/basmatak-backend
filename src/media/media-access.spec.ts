import { Types } from 'mongoose';
import { MediaAccessService, OpportunityMediaAccess } from './media-access';
import { MediaModel } from './schemas/media.schema';

function media(overrides: Partial<MediaModel>): MediaModel {
  return {
    ownerId: new Types.ObjectId(),
    purpose: 'submission_evidence',
    visibility: 'public',
    type: 'file',
    ...overrides,
  } as MediaModel;
}

function actor(
  sub?: string,
  role: 'volunteer' | 'organization' | 'admin' = 'volunteer',
) {
  return {
    sub: sub ?? new Types.ObjectId().toString(),
    role,
    sessionId: '64b000000000000000000020',
  };
}

describe('MediaAccessService (§6 private-media matrix)', () => {
  let denialSeam: OpportunityMediaAccess;
  let service: MediaAccessService;

  beforeEach(() => {
    denialSeam = new OpportunityMediaAccess();
    service = new MediaAccessService(denialSeam);
  });

  it('denies guests and deleted rows regardless of visibility', async () => {
    expect(await service.canRead(undefined, media({}))).toBe(false);
    expect(
      await service.canRead(
        actor(),
        media({ visibility: 'private', deletedAt: new Date() }),
      ),
    ).toBe(false);
    expect(
      await service.canRead(
        actor(),
        media({ visibility: 'public', deletedAt: new Date() }),
      ),
    ).toBe(false);
  });

  it('grants any authenticated actor on public media', async () => {
    expect(
      await service.canRead(actor(), media({ visibility: 'public' })),
    ).toBe(true);
  });

  it('grants the owner and admins on private media', async () => {
    const ownerId = new Types.ObjectId();
    expect(
      await service.canRead(
        actor(ownerId.toString()),
        media({ visibility: 'private', ownerId }),
      ),
    ).toBe(true);
    expect(
      await service.canRead(
        actor(undefined, 'admin'),
        media({ visibility: 'private' }),
      ),
    ).toBe(true);
  });

  it('denies a stranger on private media unless the org seam allows it', async () => {
    const row = media({
      visibility: 'private',
      ownerId: new Types.ObjectId(),
    });
    expect(await service.canRead(actor(), row)).toBe(false);

    const probing = new OpportunityMediaAccess();
    const allowed = jest.spyOn(probing, 'allows').mockResolvedValue(true);
    expect(await new MediaAccessService(probing).canRead(actor(), row)).toBe(
      true,
    );
    expect(allowed).toHaveBeenCalledTimes(1);
  });
});
