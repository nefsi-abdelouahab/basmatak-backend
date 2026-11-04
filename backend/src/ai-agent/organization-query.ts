import { isStopword, normalizeText } from './knowledge/normalizer';

/**
 * Deterministic organization-name handling.
 *
 * An organization question such as "هل هناك جمعية نور" must not depend on the
 * provider or on a substring match: "نور" is a substring of "جمعية نور
 * للتضامن", but it is not the same name. This module extracts the name the user
 * actually typed and compares normalized names exactly after removing a leading
 * organization-type word from both sides.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const ARABIC_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال'] as const;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const MAX_NAME_CHARS = 120;

const ORG_TYPE_WORDS = keywordSet([
  'جمعية',
  'جمعيات',
  'منظمة',
  'منظمات',
  'مؤسسة',
  'مؤسسات',
  'هيئة',
  'هيئات',
  'تعاونية',
  'تعاونيات',
  'association',
  'associations',
  'organization',
  'organizations',
  'organisation',
  'organisations',
  'ngo',
  'ngos',
  'charity',
  'charities',
  'foundation',
  'foundations',
  'organisme',
  'organismes',
  'fondation',
  'fondations',
  'cooperative',
  'cooperatives',
  'coopérative',
  'coopératives',
]);

const NAMING_WORDS = keywordSet([
  'called',
  'named',
  'intitulee',
  'intitule',
  'nommee',
  'nomme',
  'appelee',
  'appele',
  'اسمها',
  'اسمه',
  'تسمى',
  'يسمى',
  'تدعى',
  'يدعى',
]);

/**
 * Question/request lead-ins that may sit between an organization-type word and
 * the actual name. Location prepositions are deliberately absent so
 * "organizations in Oran" is rejected instead of being read as an organization
 * named "Oran".
 */
const LEADING_WORDS = keywordSet([
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'there',
  'any',
  'do',
  'does',
  'did',
  'you',
  'have',
  'has',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'tell',
  'me',
  'about',
  'show',
  'find',
  'search',
  'list',
  'give',
  'know',
  'knows',
  'please',
  'can',
  'could',
  'would',
  'should',
  'will',
  'for',
  'on',
  'more',
  'information',
  'info',
  'look',
  'looks',
  'looking',
  'looked',
  'up',
  'هل',
  'هناك',
  'توجد',
  'يوجد',
  'ما',
  'ماذا',
  'من',
  'هي',
  'هو',
  'التي',
  'الذي',
  'عن',
  'ابحث',
  'ابحثي',
  'اوجد',
  'اعرض',
  'أعرض',
  'اظهر',
  'أظهر',
  'اخبرني',
  'أخبرني',
  'اعطني',
  'أعطني',
  'من فضلك',
  'لو سمحت',
]);

/** Generic browse/state words that are not part of an organization name. */
const GENERIC_WORDS = keywordSet([
  'available',
  'current',
  'currently',
  'latest',
  'newest',
  'now',
  'today',
  'please',
  'platform',
  'site',
  'website',
  'organization',
  'organizations',
  'organisation',
  'organisations',
  'association',
  'associations',
  'ngo',
  'ngos',
  'charity',
  'charities',
  'متاح',
  'متاحة',
  'متاحه',
  'موجود',
  'موجودة',
  'موجوده',
  'حاليا',
  'حالياً',
  'الآن',
  'الان',
  'المنصة',
  'منصة',
  'جمعية',
  'جمعيات',
  'منظمة',
  'منظمات',
  'مؤسسة',
  'مؤسسات',
  'هيئة',
  'هيئات',
  'تعاونية',
  'تعاونيات',
]);

const LOCATION_PREPOSITIONS = keywordSet([
  'in',
  'near',
  'around',
  'dans',
  'en',
  'في',
  'قرب',
]);

const LEADING_ARTICLES = keywordSet(['the', 'le', 'la', 'les', 'l']);

/**
 * Function words that can trail a generic listing ("اعرض لي الجمعيات",
 * "give me a list of organizations"). A candidate made only of these is not a
 * name, while "Association of Nour" keeps its "of".
 */
const FILLER_WORDS = keywordSet([
  'of',
  'all',
  'some',
  'our',
  'your',
  'their',
  'its',
  'my',
  'لي',
  'لنا',
  'لك',
  'لكم',
  'جميع',
  'كل',
  'بعض',
  'de',
  'des',
  'du',
  'nos',
  'vos',
  'leurs',
  'notre',
  'votre',
  'tous',
  'toutes',
  'quelques',
]);

/**
 * Verbs and relative pronouns that mark a descriptive search ("organizations
 * that work on education") rather than a name. Names rarely contain these, so
 * skipping the exact lookup keeps topic searches on the normal tool path.
 */
const DESCRIPTIVE_WORDS = keywordSet([
  'that',
  'which',
  'who',
  'whose',
  'where',
  'work',
  'works',
  'working',
  'operate',
  'operates',
  'operating',
  'active',
  'specializing',
  'specialised',
  'specialized',
  'focused',
  'interested',
  'تعمل',
  'يعمل',
  'تعملون',
  'يعملون',
  'ناشطة',
  'ناشط',
  'تنشط',
  'ينشط',
  'العاملة',
  'العاملين',
]);

function keywordSet(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map((word) => normalizeText(word)).filter(Boolean));
}

function normalizedTokenMatches(
  normalized: string,
  keywords: ReadonlySet<string>,
): boolean {
  if (normalized === '') return false;
  if (keywords.has(normalized)) return true;
  if (!ARABIC_SCRIPT.test(normalized)) return false;

  for (const prefix of ARABIC_PREFIXES) {
    if (
      normalized.length > prefix.length + 1 &&
      normalized.startsWith(prefix) &&
      keywords.has(normalized.slice(prefix.length))
    ) {
      return true;
    }
  }
  return false;
}

function isOrgTypeToken(raw: string): boolean {
  return normalizedTokenMatches(normalizeText(raw), ORG_TYPE_WORDS);
}

function isLeadingWord(raw: string): boolean {
  const normalized = normalizeText(raw);
  return (
    normalizedTokenMatches(normalized, LEADING_WORDS) ||
    normalizedTokenMatches(normalized, NAMING_WORDS) ||
    normalizedTokenMatches(normalized, LEADING_ARTICLES)
  );
}

function isGenericWord(raw: string): boolean {
  const normalized = normalizeText(raw);
  return (
    normalizedTokenMatches(normalized, GENERIC_WORDS) ||
    normalizedTokenMatches(normalized, ORG_TYPE_WORDS) ||
    isStopword(raw)
  );
}

function isLocationPreposition(raw: string): boolean {
  return normalizedTokenMatches(normalizeText(raw), LOCATION_PREPOSITIONS);
}

function cleanRawToken(raw: string): string {
  return String(raw ?? '')
    .replace(EDGE_PUNCTUATION, '')
    .trim();
}

function rawTokens(message: string): string[] {
  return String(message ?? '')
    .trim()
    .split(/\s+/u)
    .map(cleanRawToken)
    .filter((token) => token !== '');
}

function trimCandidate(tokens: readonly string[]): string[] {
  let start = 0;
  let end = tokens.length;

  while (start < end && isLeadingWord(tokens[start] ?? '')) {
    start += 1;
  }
  while (end > start && isGenericWord(tokens[end - 1] ?? '')) {
    end -= 1;
  }

  return tokens.slice(start, end);
}

/**
 * Extract a plausible organization name from a question. The function returns
 * `undefined` for generic listings ("show me organizations", "organizations in
 * Oran") so those requests keep their normal browse behavior.
 */
export function extractOrganizationName(message: string): string | undefined {
  const tokens = rawTokens(message);
  if (tokens.length === 0) return undefined;

  let typeIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (isOrgTypeToken(tokens[index] ?? '')) typeIndex = index;
  }
  if (typeIndex === -1) return undefined;

  let candidate = trimCandidate(tokens.slice(typeIndex + 1));
  if (candidate.length === 0 && typeIndex > 0) {
    candidate = trimCandidate(tokens.slice(0, typeIndex));
  }
  if (candidate.length === 0) return undefined;

  // "organizations in Oran" names a place, not an organization.
  if (isLocationPreposition(candidate[0] ?? '')) return undefined;
  if (
    candidate.some((token) =>
      normalizedTokenMatches(normalizeText(token), DESCRIPTIVE_WORDS),
    )
  ) {
    return undefined;
  }
  if (
    candidate.every(
      (token) =>
        isGenericWord(token) ||
        normalizedTokenMatches(normalizeText(token), FILLER_WORDS),
    )
  ) {
    return undefined;
  }

  const name = candidate.join(' ');
  if (name.length <= MAX_NAME_CHARS) return name;

  const cut = name.slice(0, MAX_NAME_CHARS);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).trim();
}

function hasArabicDefiniteArticle(token: string): boolean {
  return (
    ARABIC_SCRIPT.test(token) && token.startsWith('ال') && token.length > 2
  );
}

function stripLeadingArticlesAndTypeWords(tokens: readonly string[]): string[] {
  const remaining = [...tokens];
  let start = 0;

  while (
    start < remaining.length &&
    LEADING_ARTICLES.has(remaining[start] ?? '')
  ) {
    start += 1;
  }
  while (
    start < remaining.length &&
    normalizedTokenMatches(remaining[start] ?? '', ORG_TYPE_WORDS)
  ) {
    start += 1;
  }
  if (
    start < remaining.length &&
    hasArabicDefiniteArticle(remaining[start] ?? '')
  ) {
    remaining[start] = (remaining[start] ?? '').slice('ال'.length);
  }

  return remaining.slice(start).filter(Boolean);
}

/**
 * Normalize a name for exact comparison. A leading type word is removed from
 * both the user query and the stored name, so "نور للتضامن" matches
 * "جمعية نور للتضامن" but "نور" does not.
 */
export function normalizeOrganizationName(name: string): string {
  const tokens = normalizeText(name).split(' ').filter(Boolean);
  return stripLeadingArticlesAndTypeWords(tokens).join(' ');
}

/** True when the stored row has exactly the extracted name after normalization. */
export function organizationMatchesName(
  queryName: string,
  row: Record<string, unknown>,
): boolean {
  const target = normalizeOrganizationName(queryName);
  if (target === '') return false;

  for (const field of [row.nameAr, row.nameFr, row.name, row.slug]) {
    if (typeof field !== 'string') continue;
    if (normalizeOrganizationName(field) === target) return true;
  }
  return false;
}

function tokenSequenceContains(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * True when a stored name contains the typed name as whole words. Whole-word
 * containment is what distinguishes a useful suggestion ("نور" is inside
 * "نور للتضامن") from a random substring ("نور" is also inside "تنوير").
 */
export function organizationNameContainsName(
  queryName: string,
  row: Record<string, unknown>,
): boolean {
  const targetTokens = normalizeOrganizationName(queryName)
    .split(' ')
    .filter(Boolean);
  if (targetTokens.length === 0) return false;

  for (const field of [row.nameAr, row.nameFr, row.name, row.slug]) {
    if (typeof field !== 'string') continue;
    const candidateTokens = normalizeOrganizationName(field)
      .split(' ')
      .filter(Boolean);
    if (tokenSequenceContains(candidateTokens, targetTokens)) return true;
  }
  return false;
}
