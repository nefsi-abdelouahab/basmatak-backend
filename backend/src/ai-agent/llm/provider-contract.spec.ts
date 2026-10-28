import { defaultAiAgentConfig } from '../config/ai-agent.config';
import { ProviderQuotaError } from '../budget/quota.types';
import { FakeProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { MockProvider } from './mock.provider';
import {
  createLlmProvider,
  selectLlmProvider,
  UnavailableLlmProvider,
} from './provider.factory';
import {
  LlmAbortError,
  LlmProviderUnavailableError,
  LlmTimeoutError,
} from './provider-errors';
import { LlmProvider } from './provider.interface';
import {
  checkLlmCapabilities,
  LlmDeterministicScript,
  LlmStreamEvent,
  LlmTurnRequest,
  supportsLlmCapabilities,
  toAiAgentFinishReason,
} from './provider.types';

type ScriptableProvider = LlmProvider & {
  setScript(script?: LlmDeterministicScript): unknown;
};

const baseConfig = { ...defaultAiAgentConfig(), mockDelayMs: 0 };

function request(overrides: Partial<LlmTurnRequest> = {}): LlmTurnRequest {
  return {
    systemInstruction: 'Test system instruction',
    input: 'Hello',
    maxOutputTokens: 100,
    ...overrides,
  };
}

async function collect(
  iterable: AsyncIterable<LlmStreamEvent>,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function textOf(events: LlmStreamEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<LlmStreamEvent, { type: 'text' }> =>
        event.type === 'text',
    )
    .map((event) => event.delta);
}

const providerFactories: Array<[string, () => ScriptableProvider]> = [
  ['mock', () => new MockProvider(baseConfig)],
  ['fake', () => new FakeProvider()],
];

describe.each(providerFactories)(
  '%s provider contract',
  (_name, createProvider) => {
    let provider: ScriptableProvider;

    beforeEach(() => {
      provider = createProvider();
    });

    it('advertises streaming, function calling, and a context window', () => {
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(true);
      expect(provider.capabilities.contextWindow).toBeGreaterThan(0);
      expect(
        checkLlmCapabilities(provider.capabilities, {
          streaming: true,
          functionCalling: true,
          minContextWindow: 1,
        }),
      ).toEqual({ ok: true });
    });

    it('streams deterministic text deltas in order and finishes once', async () => {
      const signal = new AbortController().signal;
      const first = await collect(provider.streamTurn(request(), signal));
      const second = await collect(provider.streamTurn(request(), signal));

      const firstDeltas = textOf(first);
      expect(firstDeltas.length).toBeGreaterThan(1);
      expect(textOf(second)).toEqual(firstDeltas);
      expect(first.filter((event) => event.type === 'finish')).toEqual([
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('preserves tool call ids, names, and parsed arguments', async () => {
      provider.setScript({
        interactionId: 'interaction-1',
        text: ['Looking that up.'],
        toolCalls: [
          {
            callId: 'call-1',
            name: 'search_opportunities',
            arguments: { text: 'beach', limit: 5 },
          },
        ],
        usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
      });

      const events = await collect(
        provider.streamTurn(request(), new AbortController().signal),
      );

      expect(events).toEqual([
        { type: 'interaction', interactionId: 'interaction-1' },
        { type: 'text', delta: 'Looking that up.' },
        {
          type: 'tool_call',
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { text: 'beach', limit: 5 },
        },
        {
          type: 'usage',
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        },
        {
          type: 'finish',
          finishReason: 'tool_calls',
          interactionId: 'interaction-1',
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        },
      ]);
    });

    it('exposes usage when available', async () => {
      provider.setScript({
        text: ['Answer'],
        usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 },
        finishReason: 'stop',
      });

      const events = await collect(
        provider.streamTurn(request(), new AbortController().signal),
      );
      expect(events.filter((event) => event.type === 'usage')).toEqual([
        {
          type: 'usage',
          usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 },
        },
      ]);
      expect(events[events.length - 1]).toMatchObject({
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 },
      });
    });

    it('maps a max-token finish to length without throwing', async () => {
      provider.setScript({ text: ['Partial'], finishReason: 'length' });

      const events = await collect(
        provider.streamTurn(request(), new AbortController().signal),
      );
      expect(events[events.length - 1]).toEqual({
        type: 'finish',
        finishReason: 'length',
      });
      expect(toAiAgentFinishReason('length')).toBe('length');
    });

    it('propagates normalized provider errors unchanged', async () => {
      const quota = new ProviderQuotaError({
        window: 'minute',
        retryAfterSeconds: 30,
      });
      provider.setScript({ error: quota });

      await expect(
        collect(provider.streamTurn(request(), new AbortController().signal)),
      ).rejects.toBe(quota);
    });

    it('stops promptly and distinguishes caller abort from timeout', async () => {
      provider.setScript({
        text: ['first', 'second'],
        delayMs: 5_000,
      });
      const controller = new AbortController();
      const iterator = provider
        .streamTurn(request({ timeoutMs: 10_000 }), controller.signal)
        [Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toMatchObject({
        value: { type: 'text', delta: 'first' },
      });

      const started = Date.now();
      const pending = iterator.next();
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(LlmAbortError);
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('maps an expired turn deadline to AI_AGENT_TIMEOUT', async () => {
      provider.setScript({
        text: ['never emitted'],
        delayMs: 5_000,
      });

      const started = Date.now();
      await expect(
        collect(
          provider.streamTurn(
            request({ timeoutMs: 20 }),
            new AbortController().signal,
          ),
        ),
      ).rejects.toBeInstanceOf(LlmTimeoutError);
      expect(Date.now() - started).toBeLessThan(500);
    });
  },
);

describe('LLM capability negotiation', () => {
  it('reports every missing capability without degrading', () => {
    const capabilities = {
      streaming: true,
      functionCalling: false,
      contextWindow: 1_000,
    } as const;

    expect(
      checkLlmCapabilities(capabilities, {
        streaming: true,
        functionCalling: true,
        minContextWindow: 2_000,
      }),
    ).toEqual({
      ok: false,
      missing: ['function_calling', 'context_window'],
    });
    expect(supportsLlmCapabilities(capabilities, { streaming: true })).toBe(
      true,
    );
    expect(
      checkLlmCapabilities(capabilities, { minContextWindow: 1_000 }),
    ).toEqual({ ok: true });
  });

  it('documents the finish-reason mapping to the SSE contract', () => {
    expect(toAiAgentFinishReason('stop')).toBe('stop');
    expect(toAiAgentFinishReason('length')).toBe('length');
    expect(toAiAgentFinishReason('error')).toBe('error');
    expect(toAiAgentFinishReason('tool_calls')).toBe('stop');
  });
});

describe('LLM provider selection', () => {
  it('selects adapters by configuration only, case-insensitively', () => {
    expect(
      createLlmProvider({ ...baseConfig, provider: 'gemini' }),
    ).toBeInstanceOf(GeminiProvider);
    expect(
      createLlmProvider({ ...baseConfig, provider: 'groq' }),
    ).toBeInstanceOf(GroqProvider);
    expect(
      createLlmProvider({ ...baseConfig, provider: 'mock' }),
    ).toBeInstanceOf(MockProvider);
    expect(
      createLlmProvider({ ...baseConfig, provider: ' FAKE ' }),
    ).toBeInstanceOf(FakeProvider);

    const adapters = {
      gemini: new GeminiProvider(baseConfig),
      groq: new GroqProvider(baseConfig, { readApiKey: () => 'test-key' }),
      mock: new MockProvider(baseConfig),
      fake: new FakeProvider(),
    };
    expect(selectLlmProvider(' Gemini ', adapters)).toBe(adapters.gemini);
    expect(selectLlmProvider('GROQ', adapters)).toBe(adapters.groq);
    expect(selectLlmProvider('MOCK', adapters)).toBe(adapters.mock);
    expect(selectLlmProvider('fake', adapters)).toBe(adapters.fake);
  });

  it('fails closed on an unknown provider without crashing construction', async () => {
    const selected = createLlmProvider({
      ...baseConfig,
      provider: 'not-a-provider',
    });

    expect(selected).toBeInstanceOf(UnavailableLlmProvider);
    expect(selected.capabilities).toEqual({
      streaming: false,
      functionCalling: false,
      contextWindow: 0,
    });
    await expect(
      collect(selected.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(LlmProviderUnavailableError);
  });
});
