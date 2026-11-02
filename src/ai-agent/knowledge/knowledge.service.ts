import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { AiAgentKnowledgeCounts } from '../ai-agent.types';
import { AppLogger } from '../../common/logger/app.logger';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import { AiAgentConfig } from '../config/ai-agent.config';
import { BM25Index } from './bm25';
import { KnowledgeChunker } from './chunker';
import { KnowledgeChunk, KnowledgeLocale } from './knowledge.types';
import { KnowledgeLoader } from './loader';
import { KnowledgeNormalizer } from './normalizer';
import {
  KnowledgeRetriever,
  RetrievalOptions,
  RetrievalResult,
} from './retriever';

const LOGGER_CONTEXT = 'KnowledgeService';

/**
 * Boot-time owner of the in-memory knowledge index.
 *
 * Session 5 loads and indexes once at startup; there is no file watching,
 * database, network, or provider dependency. Restart the process to rebuild.
 * The service only exposes aggregate counts and budget-bounded retrieval, never
 * documents or file contents.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private index: BM25Index;
  private retriever: KnowledgeRetriever;
  private counts: AiAgentKnowledgeCounts = { files: 0, chunks: 0 };
  private readonly logger: AppLogger;

  constructor(
    private readonly loader: KnowledgeLoader,
    private readonly chunker: KnowledgeChunker,
    private readonly normalizer: KnowledgeNormalizer,
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger ?? new AppLogger(LOGGER_CONTEXT);
    this.index = new BM25Index([], { normalizer: this.normalizer });
    this.retriever = this.createRetriever(this.index);
  }

  onModuleInit(): void {
    this.initialize();
  }

  /** Aggregate status counts only; no document or chunk contents are exposed. */
  getCounts(): AiAgentKnowledgeCounts {
    return { files: this.counts.files, chunks: this.counts.chunks };
  }

  /** Budget-bounded retrieval delegated to the current retriever. */
  search(
    query: string,
    locale?: KnowledgeLocale,
    options: RetrievalOptions = {},
  ): RetrievalResult {
    return this.retriever.search(query, { ...options, locale });
  }

  private initialize(): void {
    let loaded: ReturnType<KnowledgeLoader['load']>;
    try {
      loaded = this.loader.load();
    } catch {
      this.resetEmpty();
      this.warn('ai_agent_knowledge_load_failed', {
        files: 0,
        chunks: 0,
        issues: 0,
        codes: [],
      });
      return;
    }

    const codes = Array.from(
      new Set(loaded.issues.map((issue) => issue.code)),
    ).sort();
    const issueSummary = {
      files: loaded.documents.length,
      chunks: 0,
      issues: loaded.issues.length,
      codes,
    };

    if (loaded.issues.length > 0) {
      this.warn('ai_agent_knowledge_issues', issueSummary);
    }

    if (loaded.documents.length === 0) {
      this.resetEmpty();
      this.warn('ai_agent_knowledge_empty', issueSummary);
      return;
    }

    let chunks: KnowledgeChunk[];
    try {
      chunks = this.chunker.chunkAll(loaded.documents);
    } catch {
      this.resetEmpty();
      this.warn('ai_agent_knowledge_chunk_failed', issueSummary);
      return;
    }

    this.rebuild(chunks);
    this.counts = {
      files: loaded.documents.length,
      chunks: chunks.length,
    };

    if (chunks.length === 0) {
      this.warn('ai_agent_knowledge_no_chunks', {
        files: this.counts.files,
        chunks: 0,
        issues: loaded.issues.length,
        codes,
      });
      return;
    }

    this.logger.log(
      JSON.stringify({
        event: 'ai_agent_knowledge_ready',
        files: this.counts.files,
        chunks: this.counts.chunks,
      }),
      LOGGER_CONTEXT,
    );
  }

  private rebuild(chunks: readonly KnowledgeChunk[]): void {
    this.index = new BM25Index(chunks, { normalizer: this.normalizer });
    this.retriever = this.createRetriever(this.index);
  }

  private resetEmpty(): void {
    this.rebuild([]);
    this.counts = { files: 0, chunks: 0 };
  }

  private createRetriever(index: BM25Index): KnowledgeRetriever {
    return new KnowledgeRetriever(index, {
      maxChunks: this.config.limits.maxKnowledgeChunks,
      maxChars: this.config.limits.maxKnowledgeChars,
      maxEstimatedTokens: 1500,
      maxInputTokens: this.config.limits.maxInputTokens,
      normalizer: this.normalizer,
    });
  }

  private warn(event: string, payload: Record<string, unknown>): void {
    this.logger.warn(JSON.stringify({ event, ...payload }), LOGGER_CONTEXT);
  }
}
