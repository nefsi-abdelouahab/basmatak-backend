import { Model, Types } from 'mongoose';
import { OrgPublicStatsDomain } from '../common/seams/org-public-stats';
import {
  OrganizationModel,
  OrganizationReliability,
} from '../organizations/schemas/organization.schema';
import { OpportunityModel } from '../opportunities/schemas/opportunity.schema';
import { SkillCategoryModel } from '../skills/schemas/skill-category.schema';
import { TaskParticipantModel } from './schemas/task-participant.schema';
import { VolunteerExperienceModel } from '../verifications/schemas/volunteer-experience.schema';

/**
 * Shared aggregation core for Session 16 (`org-dashboard`). DI-free pure
 * helpers: every function takes its Mongoose model as an argument so the two
 * seam providers (bound in different module scopes) and the route service can
 * all reuse the same formulas without duplicating logic or dragging extra
 * model registrations into the binding modules.
 */

/** Opportunity statuses counted as active initiatives (owner-confirmed Q2). */
export const ACTIVE_OPPORTUNITY_STATUSES = ['published', 'in_progress'];
/** Opportunity statuses counted as completed initiatives (owner-confirmed Q2). */
export const COMPLETED_OPPORTUNITY_STATUSES = ['completed', 'closed'];
/** Participant statuses counted toward the public volunteer aggregate (Q-volunteers). */
export const COUNTED_VOLUNTEER_STATUSES = ['accepted', 'active'];
/** Participant statuses counted as engaged (terminal withdrawn/removed excluded). */
export const ENGAGED_PARTICIPANT_STATUSES = ['accepted', 'active', 'completed'];

/** Cap for per-domain slices (Session 9 `areasOfContribution` precedent). */
const MAX_DOMAIN_SLICES = 8;

export function toOrgObjectId(
  organizationId: Types.ObjectId | string,
): Types.ObjectId {
  return organizationId instanceof Types.ObjectId
    ? organizationId
    : new Types.ObjectId(organizationId);
}

/** Active/completed initiative counts over the org's opportunities. */
export async function countInitiatives(
  opportunityModel: Model<OpportunityModel>,
  orgId: Types.ObjectId,
): Promise<{ active: number; completed: number }> {
  const [active, completed] = await Promise.all([
    opportunityModel
      .countDocuments({
        organizationId: orgId,
        status: { $in: ACTIVE_OPPORTUNITY_STATUSES },
      })
      .exec(),
    opportunityModel
      .countDocuments({
        organizationId: orgId,
        status: { $in: COMPLETED_OPPORTUNITY_STATUSES },
      })
      .exec(),
  ]);
  return { active, completed };
}

/** Distinct volunteers engaged with the org (`accepted | active` only). */
export async function countDistinctVolunteers(
  participantModel: Model<TaskParticipantModel>,
  orgId: Types.ObjectId,
): Promise<number> {
  const ids = await participantModel
    .distinct('volunteerId', {
      organizationId: orgId,
      status: { $in: COUNTED_VOLUNTEER_STATUSES },
    })
    .exec();
  return ids.length;
}

/** Lifetime sum of verified minutes for the org (owner-confirmed Q1). */
export async function sumVerifiedHours(
  experienceModel: Model<VolunteerExperienceModel>,
  orgId: Types.ObjectId,
): Promise<number> {
  const rows = (await experienceModel
    .aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: null, total: { $sum: '$duration' } } },
    ])
    .exec()) as Array<{ total?: number }>;
  return rows[0]?.total ?? 0;
}

/** The org's cached reliability snapshot (`ReliabilityService` output). */
export async function readReliability(
  organizationModel: Model<OrganizationModel>,
  orgId: Types.ObjectId,
): Promise<OrganizationReliability | null> {
  const row = await organizationModel
    .findById(orgId)
    .select('reliability')
    .lean()
    .exec();
  return row?.reliability ?? null;
}

/**
 * Per-domain slices: share of the org's non-draft opportunities grouped by
 * `categoryId` → skill-category name (owner-confirmed Q3). Uncategorized rows
 * don't attribute to a domain and are skipped; shares sum to 1 over the
 * categorized set, sorted desc, capped at 8.
 */
export async function perDomainBreakdown(
  opportunityModel: Model<OpportunityModel>,
  skillCategoryModel: Model<SkillCategoryModel>,
  orgId: Types.ObjectId,
): Promise<OrgPublicStatsDomain[]> {
  const rows = await opportunityModel
    .find({ organizationId: orgId, status: { $ne: 'draft' } })
    .select('categoryId')
    .lean()
    .exec();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.categoryId) {
      continue;
    }
    const key = row.categoryId.toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return [];
  }
  const categories = await skillCategoryModel
    .find({
      _id: {
        $in: [...counts.keys()].map((key) => new Types.ObjectId(key)),
      },
    })
    .select('nameFr nameAr')
    .lean()
    .exec();
  const names = new Map(
    categories.map((category) => [
      category._id.toString(),
      category.nameFr ?? category.nameAr ?? 'Unknown',
    ]),
  );
  return [...counts.entries()]
    .map(([id, count]) => ({
      domain: names.get(id) ?? 'Unknown',
      share: count / total,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_DOMAIN_SLICES);
}
