import { isRecord, toIdString, toText, toTruncatedText } from './mapper.util';

/** Minimal public identity embedded on an opportunity card. */
export interface PublicOrganizationRef {
  id: string;
  slug: string;
  nameAr: string | null;
  nameFr: string | null;
}

/** Public organization card. Never contains account, contact, or registry data. */
export interface PublicOrganizationCard extends PublicOrganizationRef {
  type: string | null;
  description: string | null;
  location: {
    wilaya: string | null;
    municipality: string | null;
  } | null;
  website: string | null;
  foundedYear: number | null;
}

export interface PublicOrganizationSource {
  _id?: unknown;
  slug?: unknown;
  nameAr?: unknown;
  nameFr?: unknown;
  description?: unknown;
  type?: unknown;
  location?: {
    wilayaId?: unknown;
    municipalityId?: unknown;
  } | null;
  website?: unknown;
  foundedYear?: unknown;
}

const DESCRIPTION_MAX_CHARS = 280;

export function mapPublicOrganizationRef(
  source: PublicOrganizationSource | null | undefined,
): PublicOrganizationRef | null {
  if (!source) {
    return null;
  }
  const id = toIdString(source._id);
  if (id === null) {
    return null;
  }
  return {
    id,
    slug: toText(source.slug) ?? '',
    nameAr: toText(source.nameAr),
    nameFr: toText(source.nameFr),
  };
}

export function mapPublicOrganization(
  source: PublicOrganizationSource,
): PublicOrganizationCard {
  const ref = mapPublicOrganizationRef(source) ?? {
    id: '',
    slug: '',
    nameAr: null,
    nameFr: null,
  };
  const location = isRecord(source.location)
    ? {
        wilaya: toText(source.location.wilayaId),
        municipality: toText(source.location.municipalityId),
      }
    : null;

  return {
    ...ref,
    type: toText(source.type),
    description: toTruncatedText(source.description, DESCRIPTION_MAX_CHARS),
    location:
      location !== null &&
      (location.wilaya !== null || location.municipality !== null)
        ? location
        : null,
    website: toText(source.website),
    foundedYear:
      typeof source.foundedYear === 'number' &&
      Number.isFinite(source.foundedYear)
        ? source.foundedYear
        : null,
  };
}
