import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { AiAgentController } from './ai-agent.controller';
import { AI_AGENT_CONFIG } from './ai-agent.constants';
import { QuotaService } from './budget/quota.service';
import { AiAgentConfig, loadAiAgentConfig } from './config/ai-agent.config';
import { KnowledgeChunker } from './knowledge/chunker';
import { KnowledgeService } from './knowledge/knowledge.service';
import { KnowledgeLoader } from './knowledge/loader';
import { KnowledgeNormalizer } from './knowledge/normalizer';
import { KnowledgeParser } from './knowledge/parser';
import { MockProvider } from './llm/mock.provider';
import { SseWriter } from './sse/sse-writer';
import { SearchKnowledgeTool } from './tools/search-knowledge.tool';
import { UsageController } from './usage/usage.controller';
import { UsageMeterService } from './usage/usage-meter.service';

/**
 * Public AI assistant transport and quota module. Session 3 adds the in-memory
 * quota guard, provider cooldowns, usage meter, and admin usage endpoint.
 * Session 4 registers the knowledge loader, parser, chunker, and normalizer.
 * Session 5 builds the boot-time in-memory BM25 index and exposes read-only
 * retrieval through KnowledgeService and SearchKnowledgeTool. There is still no
 * database dependency, provider SDK, or persistence.
 */
@Module({
  controllers: [AiAgentController, UsageController],
  providers: [
    {
      provide: AI_AGENT_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        loadAiAgentConfig((key) => config.get(key)),
    },
    SseWriter,
    MockProvider,
    QuotaService,
    UsageMeterService,
    {
      provide: KnowledgeLoader,
      inject: [AI_AGENT_CONFIG],
      useFactory: (config: AiAgentConfig) =>
        new KnowledgeLoader(config.knowledgeDir),
    },
    {
      provide: KnowledgeParser,
      useFactory: () => new KnowledgeParser(),
    },
    {
      provide: KnowledgeChunker,
      useFactory: () => new KnowledgeChunker(),
    },
    {
      provide: KnowledgeNormalizer,
      inject: [AI_AGENT_CONFIG],
      useFactory: (config: AiAgentConfig) =>
        new KnowledgeNormalizer({
          synonymsPath: path.join(
            config.knowledgeDir,
            '_config',
            'synonyms.json',
          ),
        }),
    },
    KnowledgeService,
    SearchKnowledgeTool,
  ],
  exports: [
    AI_AGENT_CONFIG,
    SseWriter,
    QuotaService,
    UsageMeterService,
    KnowledgeLoader,
    KnowledgeParser,
    KnowledgeChunker,
    KnowledgeNormalizer,
    KnowledgeService,
    SearchKnowledgeTool,
  ],
})
export class AiAgentModule {}
