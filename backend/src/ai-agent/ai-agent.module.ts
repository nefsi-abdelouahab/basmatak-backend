import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentController } from './ai-agent.controller';
import { AI_AGENT_CONFIG } from './ai-agent.constants';
import { QuotaService } from './budget/quota.service';
import { loadAiAgentConfig } from './config/ai-agent.config';
import { MockProvider } from './llm/mock.provider';
import { SseWriter } from './sse/sse-writer';
import { UsageController } from './usage/usage.controller';
import { UsageMeterService } from './usage/usage-meter.service';

/**
 * Public AI assistant transport and quota module. Session 3 adds the in-memory
 * quota guard, provider cooldowns, usage meter, and admin usage endpoint. There
 * is still no database dependency, provider SDK, or persistence.
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
  ],
  exports: [AI_AGENT_CONFIG, SseWriter, QuotaService, UsageMeterService],
})
export class AiAgentModule {}
