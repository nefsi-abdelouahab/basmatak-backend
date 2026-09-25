import { Types } from 'mongoose';
import { MediaAccessService, OpportunityMediaAccess } from './media-access';
import { OrganizationOpportunityMediaAccess } from './org-opportunity-media-access';
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

  it('denies guests only on private/deleted rows — public media SHALL be guest-readable (d4/3.1)', async () => {
    // Guest × public → allow (unauthenticated read of public is the §6
    // "first row" of the matrix): the old pre-decision behaviour (guest=always
    // false) is superseded by F3/§6 — see matrix test regression 4.1.
    expect(
      await service.canRead(undefined, media({ visibility: 'public' })),
    ).toBe(true);
    // Guest × private → 404 (deny), regardless of deletion.
    expect(
      await service.canRead(undefined, media({ visibility: 'private' })),
    ).toBe(false);
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

  it('allows a guest on public media (d4/3.1: public precedes guest-deny)', async () => {
    expect(
      await service.canRead(undefined, media({ visibility: 'public' })),
    ).toBe(true);
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

describe('OrganizationOpportunityMediaAccess (backend-v2-media-org-read)', () => {
  const orgUserId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();
  const submissionId = new Types.ObjectId();
  const mediaId = new Types.ObjectId();

  function mockQuery<T>(result: T): unknown {
    return {
      select: () => ({ lean: () => ({ exec: async () => result }) }),
    };
  }

  function seam(options: {
    submission?: unknown;
    reverse?: unknown;
    organization?: unknown;
  }): {
    access: OrganizationOpportunityMediaAccess;
    submissions: { findById: jest.Mock; findOne: jest.Mock };
  } {
    const submissions = {
      findById: jest
        .fn()
        .mockReturnValue(mockQuery(options.submission ?? null)),
      findOne: jest.fn().mockReturnValue(mockQuery(options.reverse ?? null)),
    };
    const organizations = {
      findById: jest
        .fn()
        .mockReturnValue(mockQuery(options.organization ?? null)),
    };
    const access = new OrganizationOpportunityMediaAccess(
      submissions as never,
      organizations as never,
    );
    return { access, submissions };
  }

  function evidence(overrides: Partial<MediaModel>): MediaModel {
    return media({
      _id: mediaId,
      visibility: 'private',
      purpose: 'submission_evidence',
      ownerId: new Types.ObjectId(),
      ...overrides,
    } as Partial<MediaModel>);
  }

  function orgActor(sub?: string) {
    return actor(sub ?? orgUserId.toString(), 'organization');
  }

  it('allows the owning org via the direct submissionId reference', async () => {
    const { access, submissions } = seam({
      submission: { organizationId },
      organization: { userId: orgUserId },
    });
    const allowed = await access.allows(orgActor(), evidence({ submissionId }));
    expect(allowed).toBe(true);
    expect(submissions.findById).toHaveBeenCalledWith(submissionId);
    expect(submissions.findOne).not.toHaveBeenCalled();
  });

  it('allows the owning org via the evidence.mediaId reverse lookup', async () => {
    const { access, submissions } = seam({
      reverse: { organizationId },
      organization: { userId: orgUserId },
    });
    const allowed = await access.allows(orgActor(), evidence({}));
    expect(allowed).toBe(true);
    expect(submissions.findOne).toHaveBeenCalledWith({
      'evidence.mediaId': mediaId,
    });
  });

  it('denies a foreign org, non-org roles and non-evidence purposes', async () => {
    const foreign = seam({
      submission: { organizationId },
      organization: { userId: new Types.ObjectId() },
    });
    expect(await foreign.access.allows(orgActor(), evidence({}))).toBe(false);

    const volunteer = seam({
      submission: { organizationId },
      organization: { userId: orgUserId },
    });
    expect(
      await volunteer.access.allows(actor(orgUserId.toString()), evidence({})),
    ).toBe(false);

    const cover = seam({
      submission: { organizationId },
      organization: { userId: orgUserId },
    });
    expect(
      await cover.access.allows(
        orgActor(),
        evidence({ purpose: 'opportunity_cover', visibility: 'public' }),
      ),
    ).toBe(false);
  });

  it('denies (never throws) on missing submission, missing org, or model errors', async () => {
    const missing = seam({ organization: { userId: orgUserId } });
    // submission null AND reverse null (default seam options)
    expect(await missing.access.allows(orgActor(), evidence({}))).toBe(false);

    const noOrg = seam({ submission: { organizationId } });
    expect(await noOrg.access.allows(orgActor(), evidence({}))).toBe(false);

    const throwing = {
      findById: jest.fn().mockImplementation(() => {
        throw new Error('db down');
      }),
      findOne: jest.fn(),
    };
    const access = new OrganizationOpportunityMediaAccess(
      throwing as never,
      {} as never,
    );
    await expect(access.allows(orgActor(), evidence({}))).resolves.toBe(false);
  });
});
