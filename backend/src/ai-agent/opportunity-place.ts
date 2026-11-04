import { normalizeText } from './knowledge/normalizer';

/**
 * Place-name resolution for the opportunity search tool.
 *
 * The assistant may receive a sentence such as "فرص برمجة في وهران" or
 * "opportunities in Oran". The opportunity documents store location codes
 * (`location.wilayaId` / `location.municipalityId`), not place names, so the
 * name must be resolved against the bilingual `locations` collection first.
 *
 * This module is pure: the caller loads the location rows and gets back the
 * matched place plus the text that remains for the topic filter. Unknown place
 * phrases return `null`, which lets the caller keep the original text search.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const ARABIC_ARTICLE = 'ال';
const MAX_PLACE_TOKENS = 8;

const ARABIC_PREPOSITIONS = new Set(['في', 'ب']);
const ENGLISH_PREPOSITIONS = new Set(['in', 'at', 'near']);
// normalizeText() folds ta marbuta to ه, so these are the normalized forms.
const COMPOUND_PREPOSITIONS = new Set(['بولايه', 'ببلديه', 'بمدينه']);
const PLACE_QUALIFIERS = new Set([
  'ولايه',
  'ولاية',
  'بلديه',
  'بلدية',
  'مدينه',
  'مدينة',
  'wilaya',
  'province',
  'municipality',
  'commune',
  'city',
  'town',
  'the',
  'of',
]);

/**
 * Common spellings that are not the literal stored name. Keys are already
 * normalized by `normalizePlaceName`.
 */
const PLACE_ALIASES = new Map<string, string>([
  ['algiers', 'alger'],
  ['algier', 'alger'],
  ['alger la blanche', 'alger'],
  ['ouahran', 'oran'],
  ['wahran', 'oran'],
  ['timimoune', 'timimoun'],
  ['qacentina', 'constantine'],
  ['sidi bel abbas', 'sidi bel abbes'],
  ['sidi belabbes', 'sidi bel abbes'],
  ['sidibelabbes', 'sidi bel abbes'],
  // "الجزائر العاصمة" is the common name for the capital wilaya.
  ['جزاير عاصمه', 'جزاير'],
  ['جزاير العاصمه', 'جزاير'],
  ['جزائر عاصمه', 'جزاير'],
  ['جزائر العاصمه', 'جزاير'],
]);

export interface LocationSource {
  code?: unknown;
  type?: unknown;
  parentCode?: unknown;
  nameAr?: unknown;
  nameFr?: unknown;
}

export interface ResolvedPlace {
  type: 'wilaya' | 'municipality';
  code: string;
  parentCode?: string;
  nameAr: string;
  nameFr: string;
}

export interface PlaceMatch {
  place: ResolvedPlace;
  /** Normalized text with the place phrase and its preposition removed. */
  remainingText: string;
}

interface PlaceIndex {
  byKey: ReadonlyMap<string, ResolvedPlace>;
  maxTokens: number;
}

interface TokenSpan {
  start: number;
  end: number;
  place: ResolvedPlace;
}

function stripArabicArticle(token: string): string {
  if (!ARABIC_SCRIPT.test(token)) return token;
  if (
    token.length > ARABIC_ARTICLE.length &&
    token.startsWith(ARABIC_ARTICLE)
  ) {
    return token.slice(ARABIC_ARTICLE.length);
  }
  return token;
}

function foldArabicHamza(value: string): string {
  return value.replace(/\u0626/g, '\u064A').replace(/\u0624/g, '\u0648');
}

function normalizePlaceText(value: string): string {
  return normalizeText(foldArabicHamza(value));
}

/**
 * Normalize a place name for comparison: case, Latin accents, Arabic alef
 * variants, ta marbuta, diacritics, punctuation, and the Arabic article.
 *
 * Arabic hamza carriers are folded before the normalizer's NFD pass; otherwise
 * "الجزائر" decomposes into a yeh plus a combining mark and is split into two
 * tokens.
 */
export function normalizePlaceName(value: string): string {
  const normalized = normalizePlaceText(typeof value === 'string' ? value : '');
  if (normalized === '') return '';
  return normalized
    .split(' ')
    .map(stripArabicArticle)
    .filter((token) => token !== '')
    .join(' ');
}

function canonicalPlaceKey(key: string): string {
  return PLACE_ALIASES.get(key) ?? key;
}

function toResolvedPlace(row: LocationSource): ResolvedPlace | null {
  if (row.type !== 'wilaya' && row.type !== 'municipality') return null;
  if (typeof row.code !== 'string' || row.code.trim() === '') return null;
  if (typeof row.nameAr !== 'string' || typeof row.nameFr !== 'string') {
    return null;
  }

  const place: ResolvedPlace = {
    type: row.type,
    code: row.code.trim(),
    nameAr: row.nameAr,
    nameFr: row.nameFr,
  };
  if (typeof row.parentCode === 'string' && row.parentCode.trim() !== '') {
    place.parentCode = row.parentCode.trim();
  }
  return place;
}

function buildPlaceIndex(locations: readonly LocationSource[]): PlaceIndex {
  const byKey = new Map<string, ResolvedPlace>();
  let maxTokens = 1;

  for (const row of locations) {
    const place = toResolvedPlace(row);
    if (!place) continue;

    for (const name of [place.nameAr, place.nameFr]) {
      const key = canonicalPlaceKey(normalizePlaceName(name));
      if (key === '') continue;

      // A name shared by a wilaya and a municipality (for example وهران/Oran)
      // resolves to the wilaya, which is the broader and expected area.
      const existing = byKey.get(key);
      if (
        !existing ||
        (existing.type === 'municipality' && place.type === 'wilaya')
      ) {
        byKey.set(key, place);
      }
      maxTokens = Math.max(maxTokens, key.split(' ').length);
    }
  }

  return {
    byKey,
    maxTokens: Math.min(maxTokens, MAX_PLACE_TOKENS),
  };
}

function matchPlaceAt(
  tokens: readonly string[],
  start: number,
  index: PlaceIndex,
): { place: ResolvedPlace; length: number } | null {
  const maxLength = Math.min(index.maxTokens, tokens.length - start);
  for (let length = maxLength; length >= 1; length -= 1) {
    const key = canonicalPlaceKey(
      normalizePlaceName(tokens.slice(start, start + length).join(' ')),
    );
    const place = index.byKey.get(key);
    if (place) return { place, length };
  }
  return null;
}

function matchAfterPreposition(
  tokens: readonly string[],
  index: PlaceIndex,
): TokenSpan | null {
  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];

    if (
      ARABIC_PREPOSITIONS.has(token) ||
      ENGLISH_PREPOSITIONS.has(token) ||
      COMPOUND_PREPOSITIONS.has(token)
    ) {
      let start = position + 1;
      while (start < tokens.length && PLACE_QUALIFIERS.has(tokens[start])) {
        start += 1;
      }
      const match = matchPlaceAt(tokens, start, index);
      if (match) {
        return {
          start: position,
          end: start + match.length,
          place: match.place,
        };
      }
      continue;
    }

    // Arabic "ب" is commonly written attached: بوهران، بالجزائر، بسيدي بلعباس.
    if (
      token.length > 1 &&
      ARABIC_SCRIPT.test(token) &&
      token.startsWith('ب')
    ) {
      const attached = [token.slice(1), ...tokens.slice(position + 1)];
      const match = matchPlaceAt(attached, 0, index);
      if (match) {
        return {
          start: position,
          end: position + match.length,
          place: match.place,
        };
      }
    }
  }
  return null;
}

function matchAnywhere(
  tokens: readonly string[],
  index: PlaceIndex,
): TokenSpan | null {
  for (let start = 0; start < tokens.length; start += 1) {
    const match = matchPlaceAt(tokens, start, index);
    if (match) {
      return {
        start,
        end: start + match.length,
        place: match.place,
      };
    }
  }
  return null;
}

function removePlaceSpan(tokens: readonly string[], span: TokenSpan): string {
  const kept: string[] = [];
  for (let position = 0; position < tokens.length; position += 1) {
    if (position >= span.start && position < span.end) continue;
    // A qualifier can be left behind when the fallback stripped "في" before
    // the tool ran, e.g. "ولاية وهران" arriving as "ولايه وهران".
    if (PLACE_QUALIFIERS.has(tokens[position])) continue;
    kept.push(tokens[position]);
  }
  return kept.join(' ');
}

/**
 * Resolve the first place mentioned in `text` against the location rows.
 * Returns `null` when no stored wilaya/municipality name matches, so callers
 * can fall back to the existing text search unchanged.
 */
export function resolvePlaceMention(
  text: string,
  locations: readonly LocationSource[],
): PlaceMatch | null {
  if (typeof text !== 'string' || text.trim() === '') return null;
  if (!Array.isArray(locations) || locations.length === 0) return null;

  const normalized = normalizePlaceText(text);
  if (normalized === '') return null;

  const tokens = normalized.split(' ').filter((token) => token !== '');
  if (tokens.length === 0) return null;

  const index = buildPlaceIndex(locations);
  const span =
    matchAfterPreposition(tokens, index) ?? matchAnywhere(tokens, index);
  if (!span) return null;

  return {
    place: span.place,
    remainingText: removePlaceSpan(tokens, span),
  };
}
