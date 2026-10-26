import { GoogleGenAI } from '@google/genai';
import { ProviderQuotaError } from '../budget/quota.types';
import { defaultAiAgentConfig } from '../config/ai-agent.config';
import { GeminiProvider } from './gemini.provider';
import {
  LlmAbortError,
  LlmInvalidResponseError,
  LlmProviderUnavailableError,
  LlmTimeoutError,
} from './provider-errors';
import { LlmStreamEvent, LlmTurnRequest } from './provider.types';

const mockCreateInteraction = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: { create: mockCreateInteraction },
  })),
}));

const GoogleGenAIMock = GoogleGenAI as unknown as jest.Mock;

const config = { ...defaultAiAgentConfig(), model: 'gemini-3.8-flash' };

function createProvider(
  readApiKey: () => string | undefined = () => 'test-api-key',
): GeminiProvider {
  return new GeminiProvider(config, { readApiKey });
}

function request(overrides: Partial<LlmTurnRequest> = {}): LlmTurnRequest {
  return {
    systemInstruction: 'SYSTEM_INSTRUCTION_MARKER',
    input: 'USER_PROMPT_MARKER',
    tools: [
      {
        name: 'search_knowledge',
        description: 'Search the curated knowledge corpus.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    maxOutputTokens: 123,
    ...overrides,
  };
}

function streamOf(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

async function collect(
  iterable: AsyncIterable<LlmStreamEvent>,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function created(id = 'interaction-1'): Record<string, unknown> {
  return {
    event_type: 'interaction.created',
    interaction: { id, status: 'in_progress' },
  };
}

function textStart(index = 0): Record<string, unknown> {
  return {
    event_type: 'step.start',
    index,
    step: { type: 'model_output' },
  };
}

function textDelta(text: string, index = 0): Record<string, unknown> {
  return {
    event_type: 'step.delta',
    index,
    delta: { type: 'text', text },
  };
}

function completed(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event_type: 'interaction.completed',
    interaction: {
      id: 'interaction-1',
      status: 'completed',
      ...overrides,
    },
  };
}

function abortError(): Error {
  return Object.assign(new Error('aborted by the client'), {
    name: 'AbortError',
  });
}

beforeEach(() => {
  mockCreateInteraction.mockReset();
  GoogleGenAIMock.mockClear();
});

describe('GeminiProvider request mapping', () => {
  it('passes model, system instruction, tools, stream, max tokens, and previous interaction id', async () => {
    mockCreateInteraction.mockResolvedValue(
      streamOf([
        created(),
        textStart(),
        textDelta('Hello'),
        completed({
          usage: {
            total_input_tokens: 10,
            total_output_tokens: 2,
            total_tokens: 12,
          },
        }),
      ]),
    );

    const events = await collect(
      createProvider().streamTurn(
        request({ previousInteractionId: 'previous-1' }),
        new AbortController().signal,
      ),
    );

    expect(GoogleGenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
    });
    expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
    const [params, options] = mockCreateInteraction.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(params).toMatchObject({
      model: 'gemini-3.8-flash',
      input: 'USER_PROMPT_MARKER',
      system_instruction: 'SYSTEM_INSTRUCTION_MARKER',
      tools: [
        {
          type: 'function',
          name: 'search_knowledge',
          description: 'Search the curated knowledge corpus.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ],
      stream: true,
      previous_interaction_id: 'previous-1',
      generation_config: { max_output_tokens: 123 },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.retries).toEqual({ strategy: 'none' });
    expect(events[0]).toEqual({
      type: 'interaction',
      interactionId: 'interaction-1',
    });
  });

  it('re-sends interaction-scoped system instruction and tools on follow-ups', async () => {
    mockCreateInteraction.mockImplementation(() =>
      Promise.resolve(streamOf([created(), textDelta('ok'), completed()])),
    );
    const provider = createProvider();
    const signal = new AbortController().signal;

    await collect(
      provider.streamTurn(
        request({ previousInteractionId: 'previous-1' }),
        signal,
      ),
    );
    await collect(
      provider.streamTurn(
        request({
          previousInteractionId: 'previous-2',
          model: 'override-model',
        }),
        signal,
      ),
    );

    expect(mockCreateInteraction).toHaveBeenCalledTimes(2);
    const first = mockCreateInteraction.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const second = mockCreateInteraction.mock.calls[1][0] as Record<
      string,
      unknown
    >;

    for (const params of [first, second]) {
      expect(params.system_instruction).toBe('SYSTEM_INSTRUCTION_MARKER');
      expect(params.tools).toEqual([
        expect.objectContaining({
          type: 'function',
          name: 'search_knowledge',
        }),
      ]);
      expect(params.stream).toBe(true);
    }
    expect(first.previous_interaction_id).toBe('previous-1');
    expect(second.previous_interaction_id).toBe('previous-2');
    expect(second.model).toBe('override-model');
  });
});

describe('GeminiProvider stream mapping', () => {
  it('emits text deltas in order, then usage and a stop finish', async () => {
    const usage = {
      total_input_tokens: 10,
      total_output_tokens: 3,
      total_tokens: 13,
    };
    mockCreateInteraction.mockResolvedValue(
      streamOf([
        created('interaction-9'),
        textStart(),
        textDelta('Hello '),
        textDelta('world'),
        completed({ id: 'interaction-9', usage }),
      ]),
    );

    const events = await collect(
      createProvider().streamTurn(request(), new AbortController().signal),
    );

    expect(events).toEqual([
      { type: 'interaction', interactionId: 'interaction-9' },
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'world' },
      {
        type: 'usage',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
      },
      {
        type: 'finish',
        finishReason: 'stop',
        interactionId: 'interaction-9',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
      },
    ]);
  });

  it('accumulates arguments_delta JSON and emits one parsed tool call', async () => {
    const functionCall = {
      type: 'function_call',
      id: 'call-1',
      name: 'search_opportunities',
      arguments: {},
    };
    mockCreateInteraction.mockResolvedValue(
      streamOf([
        created(),
        {
          event_type: 'step.start',
          index: 0,
          step: functionCall,
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'arguments_delta',
            arguments: '{"text":"bea',
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'arguments_delta',
            arguments: 'ch","limit":5}',
          },
        },
        { event_type: 'step.stop', index: 0 },
        completed({
          status: 'requires_action',
          steps: [
            {
              ...functionCall,
              arguments: { text: 'beach', limit: 5 },
            },
          ],
        }),
      ]),
    );

    const events = await collect(
      createProvider().streamTurn(request(), new AbortController().signal),
    );

    expect(events.filter((event) => event.type === 'tool_call')).toEqual([
      {
        type: 'tool_call',
        callId: 'call-1',
        name: 'search_opportunities',
        arguments: { text: 'beach', limit: 5 },
      },
    ]);
    expect(events[events.length - 1]).toMatchObject({
      type: 'finish',
      finishReason: 'tool_calls',
      interactionId: 'interaction-1',
    });
  });

  it('maps incomplete and budget-exceeded completions to length', async () => {
    for (const status of ['incomplete', 'budget_exceeded']) {
      mockCreateInteraction.mockResolvedValue(
        streamOf([
          created(),
          textDelta('partial answer'),
          completed({ status }),
        ]),
      );

      const events = await collect(
        createProvider().streamTurn(request(), new AbortController().signal),
      );
      expect(events[events.length - 1]).toMatchObject({
        type: 'finish',
        finishReason: 'length',
      });
    }
  });

  it('rejects malformed tool arguments with a safe normalized error', async () => {
    mockCreateInteraction.mockResolvedValue(
      streamOf([
        created(),
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-1',
            name: 'search_opportunities',
            arguments: {},
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'arguments_delta',
            arguments: '{"text":',
          },
        },
        { event_type: 'step.stop', index: 0 },
      ]),
    );

    let caught: unknown;
    try {
      await collect(
        createProvider().streamTurn(request(), new AbortController().signal),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LlmInvalidResponseError);
    const safe = caught as Error;
    expect(safe.message).toBe(
      'The model provider returned an invalid response.',
    );
    expect(safe.message).not.toContain('{"text":');
    expect(safe.message).not.toContain('SYSTEM_INSTRUCTION_MARKER');
  });

  it('maps a stream error event to a normalized quota error', async () => {
    mockCreateInteraction.mockResolvedValue(
      streamOf([
        created(),
        {
          event_type: 'error',
          error: {
            code: 'RESOURCE_EXHAUSTED',
            message:
              'PROVIDER_BODY_MARKER quota "retryDelay": "37s" API_KEY_MARKER',
          },
        },
      ]),
    );

    let caught: unknown;
    try {
      await collect(
        createProvider().streamTurn(request(), new AbortController().signal),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderQuotaError);
    const quota = caught as ProviderQuotaError;
    expect(quota.window).toBe('minute');
    expect(quota.retryAfterSeconds).toBe(37);
    expect(quota.message).not.toContain('PROVIDER_BODY_MARKER');
    expect(quota.message).not.toContain('API_KEY_MARKER');
  });
});

describe('GeminiProvider error normalization', () => {
  it('maps 429 to ProviderQuotaError with retry metadata and no body leak', async () => {
    mockCreateInteraction.mockRejectedValue(
      Object.assign(
        new Error(
          'RESOURCE_EXHAUSTED PROVIDER_BODY_MARKER "retryDelay": "42s"',
        ),
        { status: 429 },
      ),
    );

    let caught: unknown;
    try {
      await collect(
        createProvider().streamTurn(request(), new AbortController().signal),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderQuotaError);
    const quota = caught as ProviderQuotaError;
    expect(quota.retryAfterSeconds).toBe(42);
    expect(quota.window).toBe('minute');
    expect(quota.message).not.toContain('PROVIDER_BODY_MARKER');
    expect(quota.message).not.toContain('RESOURCE_EXHAUSTED');
    expect(quota.message).not.toContain('test-api-key');
  });

  it('maps 5xx to AI_AGENT_PROVIDER_UNAVAILABLE without the response body', async () => {
    mockCreateInteraction.mockRejectedValue(
      Object.assign(
        new Error('PROVIDER_BODY_MARKER completion text USER_PROMPT_MARKER'),
        { status: 503 },
      ),
    );

    let caught: unknown;
    try {
      await collect(
        createProvider().streamTurn(request(), new AbortController().signal),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LlmProviderUnavailableError);
    const safe = caught as LlmProviderUnavailableError;
    expect(safe.code).toBe('AI_AGENT_PROVIDER_UNAVAILABLE');
    expect(safe.message).toBe('The model provider is temporarily unavailable.');
    expect(safe.message).not.toContain('PROVIDER_BODY_MARKER');
    expect(safe.message).not.toContain('USER_PROMPT_MARKER');
    expect(safe.message).not.toContain('test-api-key');
  });

  it('maps a turn deadline to AI_AGENT_TIMEOUT without waiting 45 seconds', async () => {
    mockCreateInteraction.mockImplementation(
      () => new Promise(() => undefined),
    );

    const started = Date.now();
    await expect(
      collect(
        createProvider().streamTurn(
          request({ timeoutMs: 20 }),
          new AbortController().signal,
        ),
      ),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('aborts promptly, keeps partial text, and stays distinct from timeout', async () => {
    mockCreateInteraction.mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) => {
        const stream = {
          async *[Symbol.asyncIterator]() {
            yield created();
            yield textDelta('partial');
            await new Promise<never>((_resolve, reject) => {
              const signal = options.signal;
              if (signal.aborted) {
                reject(abortError());
                return;
              }
              signal.addEventListener('abort', () => reject(abortError()), {
                once: true,
              });
            });
          },
        };
        return Promise.resolve(stream);
      },
    );

    const controller = new AbortController();
    const iterator = createProvider()
      .streamTurn(request({ timeoutMs: 10_000 }), controller.signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'interaction', interactionId: 'interaction-1' },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'text', delta: 'partial' },
      done: false,
    });

    const pending = iterator.next();
    const started = Date.now();
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(LlmAbortError);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('fails closed only when a turn is attempted without GEMINI_API_KEY', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const provider = new GeminiProvider(config);
      await expect(
        collect(provider.streamTurn(request(), new AbortController().signal)),
      ).rejects.toBeInstanceOf(LlmProviderUnavailableError);
      expect(GoogleGenAIMock).not.toHaveBeenCalled();
      expect(mockCreateInteraction).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = original;
    }
  });
});
