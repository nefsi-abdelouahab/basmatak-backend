import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentController } from './ai-agent.controller';
import { AI_AGENT_CONFIG } from './ai-agent.constants';
import { loadAiAgentConfig } from './config/ai-agent.config';
import { MockProvider } from './llm/mock.provider';
import { SseWriter } from './sse/sse-writer';

/**
 * Public AI assistant transport module. Session 2 deliberately has no database
 * dependency, no provider SDK, and no persistence. Later sessions add quota,
 * knowledge, tools, and the real provider behind the same controller contract.
 */
@Module({
  controllers: [AiAgentController],
  providers: [
    {
      provide: AI_AGENT_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        loadAiAgentConfig((key) => config.get(key)),
    },
    SseWriter,
    MockProvider,
  ],
  exports: [AI_AGENT_CONFIG, SseWriter],
})
export class AiAgentModule {}
