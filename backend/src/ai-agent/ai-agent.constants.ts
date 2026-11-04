/**
 * Stable constants for the AI assistant transport contract.
 *
 * Validation limits are fixed in this session. The configurable caps in
 * `config/ai-agent.config.ts` mirror these defaults; the DTO keeps the public
 * 2,000/6/4,000 contract even if an operator raises an internal cap later.
 */

import { AiAgentLocale } from './ai-agent.types';

/** DI token for the immutable, parsed AI-agent configuration. */
export const AI_AGENT_CONFIG = Symbol('AI_AGENT_CONFIG');

export const AI_AGENT_ROUTE = 'ai-agent';

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 6;
export const MAX_HISTORY_CHARS = 4000;

export const DEFAULT_AI_AGENT_PROVIDER = 'gemini';
export const DEFAULT_AI_AGENT_MODEL = 'gemini-3.8-flash';

/** Production heartbeat cadence. Tests override the config value. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Deterministic mock answer split into a few token deltas. No model call is
 * made in Session 2; this text is the stable fixture used by unit and e2e
 * tests. Keep it short and neutral so it cannot be mistaken for real guidance.
 */
export const MOCK_ANSWER_DELTAS: Record<AiAgentLocale, readonly string[]> = {
  en: [
    'This is a deterministic mock answer. ',
    'Basma is not connected to a language model yet. ',
    'Once connected, answers will be grounded only in Basmatak content.',
  ],
  ar: [
    'هذه إجابة تجريبية محددة. ',
    'بصمة غير متصلة بنموذج لغوي بعد. ',
    'بعد الربط، ستستند الإجابات إلى محتوى بصمتك فقط.',
  ],
};

export const SSE_EVENT_NAMES = [
  'meta',
  'status',
  'sources',
  'token',
  'cards',
  'done',
  'error',
] as const;
