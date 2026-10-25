import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as path from 'path';
import {
  LocationSchema,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import {
  OpportunitySchema,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { SkillSchema, SkillsCollection } from '../skills/schemas/skill.schema';
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
import { PlatformStatsTool } from './tools/platform-stats.tool';
import { SearchKnowledgeTool } from './tools/search-knowledge.tool';
import { SearchOpportunitiesTool } from './tools/search-opportunities.tool';
import { SearchOrganizationsTool } from './tools/search-organizations.tool';
import { SearchReferenceDataTool } from './tools/search-reference-data.tool';
import { TOOL_EXECUTOR_OPTIONS, ToolExecutor } from './tools/tool-executor';
import { ToolRegistry } from './tools/tool-registry';
import {
  ReadOnlyTool,
  SYSTEM_TOOL_CLOCK,
  TOOL_CLOCK,
} from './tools/tool.types';
import { UsageController } from './usage/usage.controller';
import { UsageMeterService } from './usage/usage-meter.service';

/**
 * Public AI assistant transport and quota module. Session 3 adds the in-memory
 * quota guard, provider cooldowns, usage meter, and admin usage endpoint.
 * Session 4 registers the knowledge loader, parser, chunker, and normalizer.
 * Session 5 builds the boot-time in-memory BM25 index and exposes read-only
 * retrieval through KnowledgeService and SearchKnowledgeTool.
 *
 * Session 6 registers four read-only public-data tools (opportunities,
 * organizations, reference data, platform stats), a validated registry, and
 * the bounded executor. Model registrations are read-only references; no
 * feature-module business logic changes. The provider SDK, orchestration, and
 * chat wiring still do not exist.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: OrganizationsCollection, schema: OrganizationSchema },
      { name: SkillsCollection, schema: SkillSchema },
      { name: LocationsCollection, schema: LocationSchema },
    ]),
  ],
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
    SearchOpportunitiesTool,
    SearchOrganizationsTool,
    SearchReferenceDataTool,
    PlatformStatsTool,
    {
      provide: TOOL_CLOCK,
      useValue: SYSTEM_TOOL_CLOCK,
    },
    {
      provide: TOOL_EXECUTOR_OPTIONS,
      useValue: {},
    },
    {
      provide: ToolRegistry,
      inject: [
        SearchOpportunitiesTool,
        SearchOrganizationsTool,
        SearchReferenceDataTool,
        PlatformStatsTool,
      ],
      useFactory: (
        opportunities: SearchOpportunitiesTool,
        organizations: SearchOrganizationsTool,
        referenceData: SearchReferenceDataTool,
        stats: PlatformStatsTool,
      ): ToolRegistry =>
        new ToolRegistry([
          opportunities,
          organizations,
          referenceData,
          stats,
        ] satisfies ReadOnlyTool[]),
    },
    ToolExecutor,
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
    SearchOpportunitiesTool,
    SearchOrganizationsTool,
    SearchReferenceDataTool,
    PlatformStatsTool,
    ToolRegistry,
    ToolExecutor,
  ],
})
export class AiAgentModule {}
