/**
 * Paced Phase-2 live sample.
 *
 * 24 of the 70 scripted dialogues: 12 from the original 40-dialogue baseline
 * and 12 from the 30 unseen-phrasing generalization set, balanced 12 en / 12 ar.
 * It deliberately includes every named Phase-1 failure:
 *
 * - `اشرح أكثر` (verification-workflow-ar)
 * - `أخبرني عن الأولى` (gen-ordinal-first-ar)
 * - `قدم لي نبذة عنها` (gen-pronoun-summary-ar)
 * - `نعم` (gen-yesno-confirm-ar)
 * - `هل تحققت` (gen-lookup-confirm-ar)
 * - `هل هي مفتوحة؟` (opportunity-detail-ar)
 */
export const PHASE2_LIVE_SAMPLE: readonly string[] = Object.freeze([
  // Baseline: 6 English + 6 Arabic.
  'greeting-en',
  'platform-overview-en',
  'verification-workflow-en',
  'opportunity-detail-en',
  'organization-lookup-en',
  'platform-stats-en',
  'greeting-ar',
  'platform-overview-ar',
  'verification-workflow-ar',
  'opportunity-detail-ar',
  'organization-lookup-ar',
  'platform-stats-ar',
  // Generalization: 6 Arabic + 6 English.
  'gen-ordinal-first-ar',
  'gen-yesno-confirm-ar',
  'gen-pronoun-summary-ar',
  'gen-lookup-confirm-ar',
  'gen-slug-reference-ar',
  'gen-topic-switch-ar',
  'gen-browse-dialect-en',
  'gen-stats-typo-en',
  'gen-org-dialect-en',
  'gen-reference-synonyms-en',
  'gen-knowledge-followup-en',
  'gen-detail-org-en',
]);

/** Named Phase-1 failures that the sample must keep covering. */
export const PHASE2_NAMED_FAILURE_DIALOGUES: readonly string[] = Object.freeze([
  'verification-workflow-ar',
  'gen-ordinal-first-ar',
  'gen-pronoun-summary-ar',
  'gen-yesno-confirm-ar',
  'gen-lookup-confirm-ar',
  'opportunity-detail-ar',
]);
