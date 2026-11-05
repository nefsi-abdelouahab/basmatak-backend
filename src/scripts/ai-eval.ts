import * as path from 'path';
import { BM25Index } from '../ai-agent/knowledge/bm25';
import { chunkKnowledgeDocuments } from '../ai-agent/knowledge/chunker';
import { KnowledgeLocale } from '../ai-agent/knowledge/knowledge.types';
import {
  loadKnowledge,
  resolveKnowledgeRoot,
} from '../ai-agent/knowledge/loader';
import { KnowledgeNormalizer } from '../ai-agent/knowledge/normalizer';
import {
  KnowledgeRetriever,
  HARD_MAX_CHUNKS,
  HARD_MAX_ESTIMATED_TOKENS,
  HARD_MAX_KNOWLEDGE_CHARS,
} from '../ai-agent/knowledge/retriever';

/**
 * Repeatable retrieval evaluation over the committed corpus.
 *
 * English and Arabic queries exercise the current topic folders. Core FAQ
 * expectations must pass in the top four; the remaining queries measure broad
 * retrieval coverage.
 */

export const EVAL_TARGET_TOP4_RECALL = 0.8;
export const EVAL_RETRIEVAL_DEPTH = 6;

export interface EvalQuery {
  id: string;
  query: string;
  locale: KnowledgeLocale;
  /** Corpus-relative POSIX path that should answer the query. */
  expectedSource: string;
  /** Core FAQ queries must appear in the top four. */
  coreFaq?: boolean;
}

export interface EvalQueryResult {
  id: string;
  query: string;
  locale: KnowledgeLocale;
  expectedSource: string;
  coreFaq: boolean;
  topSources: string[];
  empty: boolean;
  foundAt: number | null;
  top4Hit: boolean;
  top6Hit: boolean;
}

export interface EvalMiss {
  id: string;
  query: string;
  locale: KnowledgeLocale;
  expectedSource: string;
  coreFaq: boolean;
  topSources: string[];
}

export interface EvalReport {
  queryCount: number;
  top4Hits: number;
  top6Hits: number;
  top4Recall: number;
  top6Recall: number;
  emptyResults: number;
  coreFaqTotal: number;
  coreFaqTop4Hits: number;
  results: EvalQueryResult[];
  misses: EvalMiss[];
  coreFaqMisses: EvalMiss[];
  passed: boolean;
}

export const EVAL_QUERIES: ReadonlyArray<EvalQuery> = [
  {
    id: 'faq-en-what-is-basmatak',
    query: 'What is Basmatak Tatatoua?',
    locale: 'en',
    expectedSource: '01-about/platform-overview/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-create-account',
    query: 'How do I create an account?',
    locale: 'en',
    expectedSource: '03-user-roles/account-and-sessions/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-apply',
    query: 'How do I apply for an opportunity?',
    locale: 'en',
    expectedSource: '04-workflow/apply-to-opportunity/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-verification',
    query: 'What does verification mean?',
    locale: 'en',
    expectedSource: '04-workflow/verification-process/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-visitors-apply',
    query: 'Can I apply to an opportunity without an account?',
    locale: 'en',
    expectedSource: '04-workflow/apply-to-opportunity/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-verified-experience',
    query: 'What is a Verified Experience?',
    locale: 'en',
    expectedSource: '02-concepts/verified-experience-concept/en.md',
    coreFaq: true,
  },
  {
    id: 'identity-en-who-are-you',
    query: 'Who are you?',
    locale: 'en',
    expectedSource: '09-ai-agent/about-basma/en.md',
    coreFaq: true,
  },
  {
    id: 'identity-ar-who-are-you',
    query: 'من أنت؟',
    locale: 'ar',
    expectedSource: '09-ai-agent/about-basma/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-what-is-basmatak',
    query: 'ما هي بصمتك تطوع؟',
    locale: 'ar',
    expectedSource: '01-about/platform-overview/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-create-account',
    query: 'كيف أنشئ حساباً؟',
    locale: 'ar',
    expectedSource: '03-user-roles/visitor-role/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-apply',
    query: 'كيف أتقدم على فرصة؟',
    locale: 'ar',
    expectedSource: '04-workflow/apply-to-opportunity/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-verification',
    query: 'من يوثق المساهمة؟',
    locale: 'ar',
    expectedSource: '04-workflow/verification-process/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-visitors-apply',
    query: 'هل يمكنني التقديم على فرصة بدون حساب؟',
    locale: 'ar',
    expectedSource: '03-user-roles/visitor-role/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-creator',
    query: 'من يقف وراء بصمتك تطوع؟',
    locale: 'ar',
    expectedSource: '01-about/organization-behind/ar.md',
    coreFaq: true,
  },
  {
    id: 'support-en-contact',
    query: 'Where can I find the technical support contact details?',
    locale: 'en',
    expectedSource: '01-about/contact/en.md',
    coreFaq: true,
  },
  {
    id: 'support-ar-contact',
    query: 'أين أجد بيانات التواصل مع الدعم التقني؟',
    locale: 'ar',
    expectedSource: '01-about/contact/ar.md',
    coreFaq: true,
  },
  {
    id: 'contact-en-org-phone',
    query: "Why can't I see the organization's phone?",
    locale: 'en',
    expectedSource: '08-faq/troubleshooting/en.md',
    coreFaq: true,
  },
  {
    id: 'contact-ar-org-phone',
    query: 'لماذا لا أرى هاتف المنظمة؟',
    locale: 'ar',
    expectedSource: '08-faq/troubleshooting/ar.md',
    coreFaq: true,
  },
  {
    id: 'privacy-en-data',
    query: 'What information do you collect?',
    locale: 'en',
    expectedSource: '07-privacy-and-trust/privacy-policy-summary/en.md',
  },
  {
    id: 'privacy-en-ai',
    query: 'Can you give me access to all volunteer data?',
    locale: 'en',
    expectedSource: '09-ai-agent/safety-and-privacy-rules/en.md',
  },
  {
    id: 'privacy-ar-data',
    query: 'ما المعلومات التي تجمعها المنصة؟',
    locale: 'ar',
    expectedSource: '07-privacy-and-trust/privacy-policy-summary/ar.md',
  },
  {
    id: 'terms-en-content',
    query: 'What content is not allowed?',
    locale: 'en',
    expectedSource: '07-privacy-and-trust/terms-summary/en.md',
  },
  {
    id: 'terms-ar-content',
    query: 'ما المحتوى غير المسموح؟',
    locale: 'ar',
    expectedSource: '07-privacy-and-trust/terms-summary/ar.md',
  },
  {
    id: 'guide-en-opportunity',
    query: 'What does an opportunity page show?',
    locale: 'en',
    expectedSource: '05-pages-and-features/opportunity-details/en.md',
  },
  {
    id: 'guide-en-evidence',
    query: 'What evidence can I attach?',
    locale: 'en',
    expectedSource: '04-workflow/media-and-evidence-limits/en.md',
  },
  {
    id: 'guide-ar-tasks',
    query: 'أين أجد المهام التي تم قبولي لها؟',
    locale: 'ar',
    expectedSource: '05-pages-and-features/my-tasks/ar.md',
  },
  {
    id: 'guide-ar-evidence',
    query: 'ما أنواع الأدلة المقبولة؟',
    locale: 'ar',
    expectedSource: '04-workflow/media-and-evidence-limits/ar.md',
  },
  {
    id: 'new-opportunity-statuses',
    query: 'What are the opportunity statuses?',
    locale: 'en',
    expectedSource: '04-workflow/opportunity-statuses/en.md',
  },
  {
    id: 'new-status-reference',
    query: 'What is the difference between an application and a participation?',
    locale: 'en',
    expectedSource: '04-workflow/status-reference/en.md',
  },
  {
    id: 'new-media-evidence-ar',
    query: 'هل يمكنني رفع فيديو؟',
    locale: 'ar',
    expectedSource: '04-workflow/media-and-evidence-limits/ar.md',
  },
  {
    id: 'new-notification-types',
    query: 'What notification types and recipients exist?',
    locale: 'en',
    expectedSource: '05-pages-and-features/notification-types/en.md',
  },
  {
    id: 'new-volunteer-public-settings',
    query: 'What is shown on my public profile by default?',
    locale: 'en',
    expectedSource: '07-privacy-and-trust/volunteer-public-settings/en.md',
  },
  {
    id: 'new-portfolio',
    query: 'What is the portfolio?',
    locale: 'en',
    expectedSource: '05-pages-and-features/portfolio/en.md',
  },
  {
    id: 'new-reviews',
    query: 'Can I review an organization?',
    locale: 'en',
    expectedSource: '02-concepts/reviews-and-ratings/en.md',
  },
  {
    id: 'new-reliability',
    query: 'What is the publish gate?',
    locale: 'en',
    expectedSource: '02-concepts/organization-reliability/en.md',
  },
  {
    id: 'new-account-sessions',
    query: 'How long does an access token last?',
    locale: 'en',
    expectedSource: '03-user-roles/account-and-sessions/en.md',
  },
  {
    id: 'new-account-deletion',
    query: 'Is account deletion a soft delete?',
    locale: 'en',
    expectedSource: '07-privacy-and-trust/account-deletion/en.md',
  },
  {
    id: 'data-en-wilaya',
    query: 'What is a wilaya?',
    locale: 'en',
    expectedSource: 'data/glossary.csv',
  },
  {
    id: 'new-reliability-ar',
    query: 'ما هي موثوقية المنظمة؟',
    locale: 'ar',
    expectedSource: '02-concepts/organization-reliability/ar.md',
  },
  {
    id: 'topics-en-finding',
    query: 'Finding volunteer opportunities',
    locale: 'en',
    expectedSource: 'data/topics.json',
  },
  {
    id: 'browse-en-available',
    query: 'Browse opportunities',
    locale: 'en',
    expectedSource: '05-pages-and-features/opportunities-page/en.md',
  },
  {
    id: 'browse-en-show',
    query: 'Where can I find opportunities?',
    locale: 'en',
    expectedSource: '05-pages-and-features/opportunities-page/en.md',
  },
  {
    id: 'browse-ar-available',
    query: 'ما هي الفرص المتوفرة',
    locale: 'ar',
    expectedSource: '05-pages-and-features/opportunities-page/ar.md',
  },
  {
    id: 'topics-ar-applying',
    query: 'الترشح والمشاركة',
    locale: 'ar',
    expectedSource: 'data/topics.json',
  },
  {
    id: 'browse-en-oran',
    query: 'opportunities in Oran',
    locale: 'en',
    expectedSource: '05-pages-and-features/opportunities-page/en.md',
  },
  {
    id: 'browse-ar-oran',
    query: 'فرص في وهران',
    locale: 'ar',
    expectedSource: '05-pages-and-features/opportunities-page/ar.md',
  },
  {
    id: 'data-ar-wilaya',
    query: 'ما معنى ولاية؟',
    locale: 'ar',
    expectedSource: 'data/glossary.csv',
  },
  {
    id: 'new-opportunity-lifecycle',
    query: 'What are the stages of the opportunity lifecycle?',
    locale: 'en',
    expectedSource: '04-workflow/opportunity-lifecycle/en.md',
  },
  {
    id: 'new-review-selection',
    query: 'How does the organization review and select applicants?',
    locale: 'en',
    expectedSource: '04-workflow/review-and-selection/en.md',
  },
  {
    id: 'new-notifications-page',
    query: 'Where can I see my notifications?',
    locale: 'en',
    expectedSource: '05-pages-and-features/notifications/en.md',
  },
  {
    id: 'new-organization-role',
    query: 'What is the organization role on the platform?',
    locale: 'en',
    expectedSource: '03-user-roles/organization-role/en.md',
  },
  {
    id: 'new-publish-ar',
    query: 'كيف أنشر فرصة تطوعية؟',
    locale: 'ar',
    expectedSource: '04-workflow/publish-opportunity/ar.md',
  },
  {
    id: 'new-task-execution-ar',
    query: 'كيف أنفذ المهمة بعد القبول؟',
    locale: 'ar',
    expectedSource: '04-workflow/task-execution/ar.md',
  },
];

function hitWithin(foundAt: number | null, depth: number): boolean {
  return foundAt !== null && foundAt >= 0 && foundAt < depth;
}

function toMiss(result: EvalQueryResult): EvalMiss {
  return {
    id: result.id,
    query: result.query,
    locale: result.locale,
    expectedSource: result.expectedSource,
    coreFaq: result.coreFaq,
    topSources: [...result.topSources],
  };
}

/**
 * Pure recall/threshold calculation. `observations` maps a query id to the
 * ordered sources returned for it (empty array means no result).
 */
export function buildEvalReport(
  queries: ReadonlyArray<EvalQuery>,
  observations: ReadonlyMap<string, readonly string[]>,
): EvalReport {
  const results: EvalQueryResult[] = queries.map((query) => {
    const topSources = [...(observations.get(query.id) ?? [])];
    const foundAt = topSources.indexOf(query.expectedSource);

    return {
      id: query.id,
      query: query.query,
      locale: query.locale,
      expectedSource: query.expectedSource,
      coreFaq: query.coreFaq === true,
      topSources,
      empty: topSources.length === 0,
      foundAt: foundAt >= 0 ? foundAt : null,
      top4Hit: hitWithin(foundAt >= 0 ? foundAt : null, 4),
      top6Hit: hitWithin(foundAt >= 0 ? foundAt : null, 6),
    };
  });

  const queryCount = results.length;
  const top4Hits = results.filter((result) => result.top4Hit).length;
  const top6Hits = results.filter((result) => result.top6Hit).length;
  const misses = results.filter((result) => !result.top4Hit).map(toMiss);
  const coreResults = results.filter((result) => result.coreFaq);
  const coreFaqMisses = coreResults
    .filter((result) => !result.top4Hit)
    .map(toMiss);
  const top4Recall = queryCount === 0 ? 0 : top4Hits / queryCount;
  const top6Recall = queryCount === 0 ? 0 : top6Hits / queryCount;

  return {
    queryCount,
    top4Hits,
    top6Hits,
    top4Recall,
    top6Recall,
    emptyResults: results.filter((result) => result.empty).length,
    coreFaqTotal: coreResults.length,
    coreFaqTop4Hits: coreResults.length - coreFaqMisses.length,
    results,
    misses,
    coreFaqMisses,
    passed:
      queryCount > 0 &&
      top4Recall >= EVAL_TARGET_TOP4_RECALL &&
      coreFaqMisses.length === 0,
  };
}

interface CorpusEvaluation {
  files: number;
  chunks: number;
  issues: number;
  report: EvalReport;
}

function evaluateCorpus(rootDir?: string): CorpusEvaluation {
  const root = resolveKnowledgeRoot(rootDir);
  const loaded = loadKnowledge(root);
  const chunks = chunkKnowledgeDocuments(loaded.documents);
  const normalizer = new KnowledgeNormalizer({
    synonymsPath: path.join(root, '_config', 'synonyms.json'),
  });
  const index = new BM25Index(chunks, { normalizer });
  const retriever = new KnowledgeRetriever(index, {
    maxChunks: HARD_MAX_CHUNKS,
    maxChars: HARD_MAX_KNOWLEDGE_CHARS,
    maxEstimatedTokens: HARD_MAX_ESTIMATED_TOKENS,
    maxInputTokens: 3000,
    normalizer,
  });

  const observations = new Map<string, readonly string[]>();
  for (const query of EVAL_QUERIES) {
    const result = retriever.search(query.query, {
      locale: query.locale,
      topK: EVAL_RETRIEVAL_DEPTH,
    });
    observations.set(
      query.id,
      result.chunks.map((chunk) => chunk.source),
    );
  }

  return {
    files: loaded.documents.length,
    chunks: chunks.length,
    issues: loaded.issues.length,
    report: buildEvalReport(EVAL_QUERIES, observations),
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function printReport(root: string, evaluation: CorpusEvaluation): void {
  const { report } = evaluation;

  console.log('Basmatak AI retrieval evaluation');
  console.log(`Knowledge root: ${root}`);
  console.log(
    `Corpus: ${evaluation.files} files, ${evaluation.chunks} chunks, ${evaluation.issues} loader issues`,
  );
  console.log(`Queries: ${report.queryCount}`);
  console.log(
    `Top-4 recall: ${report.top4Hits}/${report.queryCount} (${formatPercent(
      report.top4Recall,
    )})`,
  );
  console.log(
    `Top-6 recall: ${report.top6Hits}/${report.queryCount} (${formatPercent(
      report.top6Recall,
    )})`,
  );
  console.log(`Empty results: ${report.emptyResults}`);
  console.log(
    `Core FAQ top-4: ${report.coreFaqTop4Hits}/${report.coreFaqTotal}`,
  );

  console.log('Per-query top-4 misses:');
  if (report.misses.length === 0) {
    console.log('  none');
  } else {
    for (const miss of report.misses) {
      const topFiles = miss.topSources.length
        ? miss.topSources.join(', ')
        : '(empty)';
      console.log(
        `  ${miss.coreFaq ? '[core] ' : ''}${miss.id} | ${miss.query} | expected ${miss.expectedSource} | top: ${topFiles}`,
      );
    }
  }

  if (report.coreFaqMisses.length > 0) {
    console.log('Core FAQ failures:');
    for (const miss of report.coreFaqMisses) {
      console.log(
        `  ${miss.id} | ${miss.query} | expected ${miss.expectedSource}`,
      );
    }
  }

  console.log(
    `Result: ${report.passed ? 'PASS' : 'FAIL'} ` +
      `(target top-4 >= ${formatPercent(
        EVAL_TARGET_TOP4_RECALL,
      )} and all core FAQ queries in top 4)`,
  );
}

function main(): void {
  try {
    const root = resolveKnowledgeRoot();
    const evaluation = evaluateCorpus(root);
    printReport(root, evaluation);
    process.exitCode = evaluation.report.passed ? 0 : 1;
  } catch (error) {
    console.error(
      `Retrieval evaluation failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
