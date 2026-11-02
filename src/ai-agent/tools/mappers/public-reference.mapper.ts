import { isRecord, toIdString, toText } from './mapper.util';

export interface PublicSkillRef {
  id: string;
  nameAr: string | null;
  nameFr: string | null;
}

export interface PublicSkill extends PublicSkillRef {
  slug: string;
  categoryId: string | null;
}

export interface PublicLocation {
  code: string;
  type: string;
  parentCode: string | null;
  nameAr: string;
  nameFr: string;
}

export interface PublicSkillSource {
  _id?: unknown;
  slug?: unknown;
  nameAr?: unknown;
  nameFr?: unknown;
  categoryId?: unknown;
}

export interface PublicLocationSource {
  code?: unknown;
  type?: unknown;
  parentCode?: unknown;
  nameAr?: unknown;
  nameFr?: unknown;
}

export function mapPublicSkillRef(
  source: PublicSkillSource,
): PublicSkillRef | null {
  const id = toIdString(source._id);
  if (id === null) {
    return null;
  }
  return {
    id,
    nameAr: toText(source.nameAr),
    nameFr: toText(source.nameFr),
  };
}

export function mapPublicSkill(source: PublicSkillSource): PublicSkill {
  const ref = mapPublicSkillRef(source) ?? {
    id: '',
    nameAr: null,
    nameFr: null,
  };
  return {
    ...ref,
    slug: toText(source.slug) ?? '',
    categoryId: toIdString(source.categoryId),
  };
}

export function mapPublicLocation(
  source: PublicLocationSource,
): PublicLocation {
  return {
    code: toText(source.code) ?? '',
    type: toText(source.type) ?? '',
    parentCode: toText(source.parentCode),
    nameAr: toText(source.nameAr) ?? '',
    nameFr: toText(source.nameFr) ?? '',
  };
}

/** Normalize a `location` sub-document to public codes only. */
export function mapPublicLocationCodes(
  value: unknown,
): { wilaya: string | null; municipality: string | null } | null {
  if (!isRecord(value)) {
    return null;
  }
  const wilaya = toText(value.wilayaId);
  const municipality = toText(value.municipalityId);
  return wilaya !== null || municipality !== null
    ? { wilaya, municipality }
    : null;
}
