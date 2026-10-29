import { DIRECT_REPLIES } from '../router/intent-router';
import {
  browseSources,
  policyMessage,
  POLICY_MESSAGE_KEYS,
} from './answer-policy';
import type { PolicyLanguage } from './answer-policy';

const LANGUAGES: readonly PolicyLanguage[] = ['en', 'ar'];

const FRENCH_TEXT =
  /[àâäçéèêëîïôöùûüÿœæ]|\b(?:bonjour|salut|bonsoir|coucou|merci|je|tu|vous|nous|les|des|une|est|sont|pour|avec|dans|votre|vos|notre|nos|au|aux|cette|ces|que|qui|comment|opportunités|organisations|informations)\b/iu;

const KNOWLEDGE_WORDING =
  /public information|Basmatak's public information|\bknowledge(?:\s+base)?\b|\bsources?\b|\bretrieval\b|\bchunks?\b|معلومات بصمتك العامة|معلومات بصمتك|قاعدة المعرفة|المصادر|الاسترجاع|المقاطع/iu;

const TOPIC_LIST_WORDING =
  /\b(?:skills?|wilayas?|reference data|platform statistics)\b|المهارات|الولايات|بيانات مرجعية|إحصاءات المنصة/iu;

function cannedStrings(): Array<{ id: string; text: string }> {
  const entries: Array<{ id: string; text: string }> = [];

  for (const key of POLICY_MESSAGE_KEYS) {
    for (const language of LANGUAGES) {
      entries.push({
        id: `policy:${key}:${language}`,
        text: policyMessage(key, language),
      });
    }
  }

  for (const language of LANGUAGES) {
    for (const [kind, text] of Object.entries(DIRECT_REPLIES[language])) {
      entries.push({ id: `direct:${kind}:${language}`, text });
    }
    for (const source of browseSources(language)) {
      entries.push({
        id: `browse:${source.id}:${language}`,
        text: source.title,
      });
    }
  }

  return entries;
}

describe('pre-LLM canned responses', () => {
  it('ships English and Arabic replies only', () => {
    expect(Object.keys(DIRECT_REPLIES).sort()).toEqual(['ar', 'en']);
  });

  it('never contains French text', () => {
    const violations = cannedStrings()
      .filter((entry) => FRENCH_TEXT.test(entry.text))
      .map((entry) => entry.id);

    expect(violations).toEqual([]);
  });

  it('never uses source or knowledge wording', () => {
    const violations = cannedStrings()
      .filter((entry) => KNOWLEDGE_WORDING.test(entry.text))
      .map((entry) => entry.id);

    expect(violations).toEqual([]);
  });

  it('never lists platform topics like a capability menu', () => {
    const violations = cannedStrings()
      .filter((entry) => TOPIC_LIST_WORDING.test(entry.text))
      .map((entry) => entry.id);

    expect(violations).toEqual([]);
  });
});
