import { PublicOrganizationRef } from './public-organization.mapper';
import {
  PublicSkillRef,
  mapPublicLocationCodes,
} from './public-reference.mapper';
import {
  isRecord,
  toIdString,
  toIsoString,
  toText,
  toTruncatedText,
} from './mapper.util';

/** Public opportunity card. Internal ids, registry ids and geo data are absent. */
export interface PublicOpportunityCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  mode: string | null;
  location: {
    wilaya: string | null;
    municipality: string | null;
  } | null;
  startDate: string | null;
  endDate: string | null;
  applicationDeadline: string | null;
  organization: PublicOrganizationRef | null;
  skills: PublicSkillRef[];
  openPositions: number;
}

export interface PublicOpportunitySource {
  _id?: unknown;
  organizationId?: unknown;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  mode?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  applicationDeadline?: unknown;
  location?: unknown;
  positions?: unknown;
  categoryId?: unknown;
}

const DESCRIPTION_MAX_CHARS = 280;

function readPositions(value: unknown): Array<{
  requiredSkills: string[];
  requiredCount: number | null;
  filledCount: number | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((position) => {
    const requiredSkills = Array.isArray(position.requiredSkills)
      ? position.requiredSkills
          .map((skill) => toIdString(skill))
          .filter((skill): skill is string => skill !== null)
      : [];
    return {
      requiredSkills,
      requiredCount:
        typeof position.requiredCount === 'number'
          ? position.requiredCount
          : null,
      filledCount:
        typeof position.filledCount === 'number' ? position.filledCount : null,
    };
  });
}

export function mapPublicOpportunity(
  source: PublicOpportunitySource,
  organization?: PublicOrganizationRef | null,
  skillsById?: ReadonlyMap<string, PublicSkillRef>,
): PublicOpportunityCard {
  const positions = readPositions(source.positions);
  const skillIds: string[] = [];
  const seenSkills = new Set<string>();
  for (const position of positions) {
    for (const skillId of position.requiredSkills) {
      if (!seenSkills.has(skillId)) {
        seenSkills.add(skillId);
        skillIds.push(skillId);
      }
    }
  }

  const skills = skillIds.flatMap((skillId) => {
    const skill = skillsById?.get(skillId);
    return skill ? [skill] : [];
  });

  const openPositions = positions.filter(
    (position) =>
      position.requiredCount !== null &&
      position.filledCount !== null &&
      position.filledCount < position.requiredCount,
  ).length;

  return {
    id: toIdString(source._id) ?? '',
    slug: toText(source.slug) ?? '',
    title: toText(source.title) ?? '',
    description: toTruncatedText(source.description, DESCRIPTION_MAX_CHARS),
    mode: toText(source.mode),
    location: mapPublicLocationCodes(source.location),
    startDate: toIsoString(source.startDate),
    endDate: toIsoString(source.endDate),
    applicationDeadline: toIsoString(source.applicationDeadline),
    organization: organization ?? null,
    skills,
    openPositions,
  };
}
