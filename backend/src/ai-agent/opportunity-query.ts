import { normalizeText, isStopword } from './knowledge/normalizer';

/**
 * Generic opportunity-browse query handling.
 *
 * A browse query such as "ما هي الفرص المتوفرة" or "show me opportunities"
 * carries no real search topic. Sending the whole sentence to the opportunity
 * tool produces zero rows because no title or description contains those
 * words. This module removes built-in stopwords plus the generic browse/request
 * vocabulary and returns only the meaningful remainder. An empty remainder
 * means the tool must run without a text filter.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const ARABIC_PREFIXES = [
  'وال',
  'بال',
  'كال',
  'فال',
  'لل',
  'ال',
  'و',
  'ب',
  'ل',
  'ف',
] as const;
const MAX_QUERY_CHARS = 120;

const BROWSE_WORDS: ReadonlySet<string> = new Set(
  [
    // Arabic question, request, and opportunity words.
    'ما',
    'ماذا',
    'هي',
    'هو',
    'هل',
    'توجد',
    'يوجد',
    'فرص',
    'فرصة',
    'فرصه',
    'الفرص',
    'الفرصة',
    'الفرصه',
    'متاح',
    'متاحة',
    'متاحه',
    'متوفر',
    'متوفرة',
    'متوفره',
    'المتاح',
    'المتاحة',
    'المتاحه',
    'المتوفر',
    'المتوفرة',
    'المتوفره',
    'اعرض',
    'اعرضي',
    'أعرض',
    'أظهر',
    'اظهر',
    'أريد',
    'اريد',
    'أرغب',
    'ارغب',
    'أحتاج',
    'احتاج',
    'أبحث',
    'ابحث',
    'أعطني',
    'اعطني',
    'أعطوني',
    'اعطوني',
    'لي',
    'لنا',
    'قائمة',
    'كل',
    'جميع',
    'أي',
    'اي',
    'بعض',
    'تطوع',
    'تطوعي',
    'تطوعية',
    'تطوعيه',
    'التطوع',
    'التطوعي',
    'التطوعية',
    'التطوعيه',
    'المنصة',
    'منصة',
    'حاليا',
    'حالياً',
    'الآن',
    'الان',
    'أحدث',
    'احدث',
    'جديد',
    'جديدة',
    'جديده',
    'حديث',
    'حديثة',
    'حديثه',
    // English request and opportunity words.
    'available',
    'show',
    'any',
    'opportunity',
    'opportunities',
    'volunteer',
    'volunteers',
    'volunteering',
    'me',
    'please',
    'current',
    'currently',
    'latest',
    'newest',
    'recent',
    'now',
    'today',
    'list',
    'find',
    'search',
    'display',
    'browse',
    'give',
    'all',
    'some',
    'open',
    'opened',
    'new',
    // French is recognized by the platform even though replies are en/ar.
    'opportunite',
    'opportunites',
    'disponible',
    'disponibles',
    'affiche',
    'afficher',
    'affichez',
    'montre',
    'montrer',
    'cherche',
    'chercher',
    'trouve',
    'trouver',
    'liste',
    'benevolat',
    'benevole',
    'actuel',
    'actuelle',
    'actuels',
    'actuelles',
    'recent',
    'recente',
    'recents',
    'recentes',
    'nouveau',
    'nouvelle',
    'nouveaux',
    'nouvelles',
  ].map((word) => normalizeText(word)),
);

function isBrowseWord(token: string): boolean {
  if (BROWSE_WORDS.has(token)) return true;
  if (!ARABIC_SCRIPT.test(token)) return false;

  for (const prefix of ARABIC_PREFIXES) {
    if (
      token.length > prefix.length + 1 &&
      token.startsWith(prefix) &&
      BROWSE_WORDS.has(token.slice(prefix.length))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Return the meaningful search text for an opportunity query. Built-in
 * stopwords and generic browse/request words are removed; if nothing remains,
 * the caller must search without a text filter.
 */
export function buildOpportunitySearchText(message: string): string {
  const normalized = normalizeText(typeof message === 'string' ? message : '');
  if (normalized === '') return '';

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const token of normalized.split(' ')) {
    if (token === '' || isStopword(token) || isBrowseWord(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    kept.push(token);
  }

  const text = kept.join(' ');
  if (text.length <= MAX_QUERY_CHARS) return text;

  const cut = text.slice(0, MAX_QUERY_CHARS);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).trim();
}

/**
 * True when the message is a generic opportunity browse request: it names
 * opportunities but has no topic left after stopword/browse-word stripping.
 */
export function isGenericOpportunityBrowse(
  message: string,
  hasOpportunityTopic: boolean,
): boolean {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '') return false;
  return hasOpportunityTopic && buildOpportunitySearchText(text) === '';
}
