import { Types } from 'mongoose';

/**
 * Shared experience-enrichment helpers (Session 15 `experience-enrichment`,
 * contract row 12). Pure mapping + batch-join assembly reused by the
 * verifications services, the volunteers dashboard/public reads, and the real
 * `AdminExperienceDisplay` provider — so every surface carries the same
 * organization identity, `verifiedAt`, `verificationCode`, `registryId`, real
 * `duration`, and neutral reviewer notes. No stored-shape change: `skills`
 * stays an ObjectId snapshot (Session 9's read-time `areasOfContribution`
 * derivation reads DB rows directly and is unaffected).
 */

export interface ExperienceLike {
  _id: Types.ObjectId;
  registryId: string;
  title: string;
  description?: string | null;
  skills: Types.ObjectId[];
  duration: number;
  organizationId: Types.ObjectId;
  submissionId: Types.ObjectId;
  verificationCode: string;
  publicVisibility: string;
  createdAt: Date;
}

export interface ExperienceOrganizationLike {
  _id: Types.ObjectId;
  slug: string;
  nameFr?: string | null;
  nameAr?: string | null;
}

export interface ExperienceVerificationLike {
  _id?: Types.ObjectId;
  submissionId: Types.ObjectId;
  decidedAt: Date;
}

export interface ExperienceReviewLike {
  submissionId: Types.ObjectId;
  rating: number;
  comment?: string | null;
  status: string;
}

export interface EnrichedExperienceOrganization {
  id: string;
  slug: string;
  nameFr: string | null;
  nameAr: string | null;
}

export interface EnrichedExperienceReview {
  rating: number;
  notes: string | null;
}

export interface EnrichedExperience {
  id: string;
  registryId: string;
  title: string;
  description: string | null;
  skills: string[];
  duration: number;
  organization: EnrichedExperienceOrganization | null;
  verifiedAt: Date;
  verificationCode: string;
  publicVisibility: string;
  review: EnrichedExperienceReview | null;
  /**
   * Owner/admin-only pointer to the issued verification row, used to read the
   * organization's private notes. Never present on public views.
   */
  verificationId: string | null;
}

/**
 * Maps one experience row to its enriched payload. `publicView` gates the
 * neutral review to `status=visible` rows only (public proof/cards); owner,
 * org, and admin variants surface any existing review. Evidence is never
 * embedded here — each variant handles evidence with its own visibility rule.
 */
export function toEnrichedExperience(
  experience: ExperienceLike,
  organization: ExperienceOrganizationLike | null | undefined,
  verification: ExperienceVerificationLike | null | undefined,
  review: ExperienceReviewLike | null | undefined,
  opts?: { publicView?: boolean },
): EnrichedExperience {
  const usableReview =
    review && (!opts?.publicView || review.status === 'visible')
      ? review
      : null;
  return {
    id: experience._id.toString(),
    registryId: experience.registryId,
    title: experience.title,
    description: experience.description ?? null,
    skills: experience.skills.map((skill) => skill.toString()),
    duration: experience.duration,
    organization: organization
      ? {
          id: organization._id.toString(),
          slug: organization.slug,
          nameFr: organization.nameFr ?? null,
          nameAr: organization.nameAr ?? null,
        }
      : null,
    verifiedAt: verification?.decidedAt ?? experience.createdAt,
    verificationCode: experience.verificationCode,
    publicVisibility: experience.publicVisibility,
    review: usableReview
      ? { rating: usableReview.rating, notes: usableReview.comment ?? null }
      : null,
    verificationId:
      opts?.publicView || !verification?._id
        ? null
        : verification._id.toString(),
  };
}

/**
 * Batch-maps page rows to enriched payloads from already-fetched lookup maps
 * (keyed by hex string). Callers run the three bounded `$in` reads; this
 * function holds no model and performs no I/O, so both module-scoped services
 * and the admin provider share it without DI cycles.
 */
export function enrichExperiences(
  experiences: ExperienceLike[],
  organizationsById: Map<string, ExperienceOrganizationLike>,
  verificationsBySubmission: Map<string, ExperienceVerificationLike>,
  reviewsBySubmission: Map<string, ExperienceReviewLike>,
  opts?: { publicView?: boolean },
): EnrichedExperience[] {
  return experiences.map((experience) =>
    toEnrichedExperience(
      experience,
      organizationsById.get(experience.organizationId.toString()) ?? null,
      verificationsBySubmission.get(experience.submissionId.toString()) ?? null,
      reviewsBySubmission.get(experience.submissionId.toString()) ?? null,
      opts,
    ),
  );
}
