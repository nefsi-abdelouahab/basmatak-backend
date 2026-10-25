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
 * French queries are deliberately cross-lingual: the corpus is English and
 * Arabic, so French expectations point at the English/Arabic file that answers
 * the question or at the bilingual glossary. Core FAQ expectations are
 * must-pass in the top four.
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
    query: 'What is Basmatak?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-create-account',
    query: 'How do I create an account?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-apply',
    query: 'How do I apply for an opportunity?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-verification',
    query: 'What does verification mean?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-visitors-apply',
    query: 'Can visitors apply for volunteering opportunities?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-en-free',
    query: 'Is Basmatak Tatatoua free to use?',
    locale: 'en',
    expectedSource: 'faq/en.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-what-is-basmatak',
    query: 'ما هي بصمتك تطوع؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-create-account',
    query: 'كيف أنشئ حساباً؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-apply',
    query: 'كيف أترشح لفرصة؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-verification',
    query: 'ماذا يعني التوثيق؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-visitors-apply',
    query: 'هل يستطيع الزوار الترشح للفرص؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'faq-ar-creator',
    query: 'من أنشأ منصة بصمتك تطوع؟',
    locale: 'ar',
    expectedSource: 'faq/ar.md',
    coreFaq: true,
  },
  {
    id: 'policy-en-report',
    query: 'How do I report inappropriate content?',
    locale: 'en',
    expectedSource: 'policies/en.md',
  },
  {
    id: 'policy-en-penalties',
    query: 'What are the penalties for violating platform rules?',
    locale: 'en',
    expectedSource: 'policies/en.md',
  },
  {
    id: 'policy-en-appeal',
    query: 'How can I appeal a platform decision?',
    locale: 'en',
    expectedSource: 'policies/en.md',
  },
  {
    id: 'policy-ar-report',
    query: 'كيف أبلغ عن محتوى مخالف؟',
    locale: 'ar',
    expectedSource: 'policies/ar.md',
  },
  {
    id: 'policy-ar-rights',
    query: 'ما هي حقوق المستخدمين؟',
    locale: 'ar',
    expectedSource: 'policies/ar.md',
  },
  {
    id: 'policy-ar-security',
    query: 'كيف أحمي حسابي بكلمة مرور قوية؟',
    locale: 'ar',
    expectedSource: 'policies/ar.md',
  },
  {
    id: 'guide-en-search',
    query: 'How do I read an opportunity before applying?',
    locale: 'en',
    expectedSource: 'guides/en.md',
  },
  {
    id: 'guide-en-evidence',
    query: 'How do I upload evidence for each deliverable?',
    locale: 'en',
    expectedSource: 'guides/en.md',
  },
  {
    id: 'guide-ar-track',
    query: 'كيف أتابع ترشيحاتي في صفحة طلباتي؟',
    locale: 'ar',
    expectedSource: 'guides/ar.md',
  },
  {
    id: 'guide-ar-evidence',
    query: 'كيف أضيف الأدلة لكل مخرج؟',
    locale: 'ar',
    expectedSource: 'guides/ar.md',
  },
  {
    id: 'data-en-wilaya',
    query: 'What is a wilaya?',
    locale: 'en',
    expectedSource: 'data/glossary.csv',
  },
  {
    id: 'data-fr-organization',
    query: "Qu'est-ce qu'une organisation ?",
    locale: 'fr',
    expectedSource: 'data/glossary.csv',
  },
  {
    id: 'topics-en-finding',
    query: 'Finding volunteer opportunities',
    locale: 'en',
    expectedSource: 'data/topics.json',
  },
  {
    id: 'fr-account',
    query: 'Comment créer un compte ?',
    locale: 'fr',
    expectedSource: 'faq/en.md',
  },
  {
    id: 'fr-privacy',
    query: 'Quelles sont les règles de confidentialité ?',
    locale: 'fr',
    expectedSource: 'policies/en.md',
  },
  {
    id: 'fr-report',
    query: 'Comment signaler un contenu inapproprié ?',
    locale: 'fr',
    expectedSource: 'policies/en.md',
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
