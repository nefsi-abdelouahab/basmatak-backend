import { AppLogger } from '../../common/logger/app.logger';
import { ProviderQuotaError } from '../budget/quota.types';
import { defaultAiAgentConfig } from '../config/ai-agent.config';
import { GroqProvider } from './groq.provider';
import {
  LlmInvalidResponseError,
  LlmProviderUnavailableError,
  LlmServerError,
} from './provider-errors';
import { LlmStreamEvent, LlmTurnRequest } from './provider.types';

type FetchMock = jest.Mock<
  Promise<Response>,
  [input: RequestInfo | URL, init?: RequestInit]
>;

const config = {
  ...defaultAiAgentConfig(),
  provider: 'groq',
  model: 'qwen/qwen3.8-27b',
};

function request(overrides: Partial<LlmTurnRequest> = {}): LlmTurnRequest {
  return {
    systemInstruction: 'Test system instruction',
    input: 'Hello',
    maxOutputTokens: 100,
    ...overrides,
  };
}

function sseResponse(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function data(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function errorResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeLogger(): { logger: AppLogger; error: jest.Mock } {
  const error = jest.fn();
  return {
    logger: { error } as unknown as AppLogger,
    error,
  };
}

function makeProvider(fetchImpl: FetchMock, logger?: AppLogger): GroqProvider {
  return new GroqProvider(config, {
    readApiKey: () => 'test-key',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    logger,
  });
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

describe('GroqProvider', () => {
  it('streams text, usage, and a finish event in the provider contract shape', async () => {
    const fetchMock = jest.fn(async () =>
      sseResponse([
        data({ choices: [{ delta: { role: 'assistant', content: '' } }] }),
        data({ choices: [{ delta: { content: 'Hello' } }] }),
        data({ choices: [{ delta: { content: ' world' } }] }),
        data({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
          },
        }),
        'data: [DONE]\n\n',
      ]),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock);

    const events = await collect(
      provider.streamTurn(request(), new AbortController().signal),
    );

    expect(events[0]).toMatchObject({ type: 'interaction' });
    expect(textOf(events)).toEqual(['Hello', ' world']);
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
    expect(events[events.length - 1]).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'qwen/qwen3.8-27b',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 100,
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'Test system instruction' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('maps tool declarations and completes streamed tool-call arguments', async () => {
    const fetchMock = jest.fn(async () =>
      sseResponse([
        data({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'search_opportunities',
                      arguments: '{"text":',
                    },
                  },
                ],
              },
            },
          ],
        }),
        data({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '"Algiers"}' } },
                ],
              },
            },
          ],
        }),
        data({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ]),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock);

    const events = await collect(
      provider.streamTurn(
        request({
          tools: [
            {
              name: 'search_opportunities',
              description: 'Search public opportunities',
              parameters: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false,
              },
            },
          ],
        }),
        new AbortController().signal,
      ),
    );

    expect(events).toContainEqual({
      type: 'tool_call',
      callId: 'call_1',
      name: 'search_opportunities',
      arguments: { text: 'Algiers' },
    });
    expect(events[events.length - 1]).toMatchObject({
      type: 'finish',
      finishReason: 'tool_calls',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search_opportunities',
          description: 'Search public opportunities',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      },
    ]);
    expect(body.tool_choice).toBe('auto');
  });

  it('replays the prior tool-call turn when continuing an interaction', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          data({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'search_opportunities',
                        arguments: '{"text":"Algiers"}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          data({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
          'data: [DONE]\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          data({ choices: [{ delta: { content: 'Found one.' } }] }),
          data({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
          'data: [DONE]\n\n',
        ]),
      ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock);

    const first = await collect(
      provider.streamTurn(
        request({ input: 'Find opportunities in Algiers' }),
        new AbortController().signal,
      ),
    );
    const interaction = first.find(
      (event): event is Extract<LlmStreamEvent, { type: 'interaction' }> =>
        event.type === 'interaction',
    );
    expect(interaction).toBeDefined();

    await collect(
      provider.streamTurn(
        request({
          previousInteractionId: interaction?.interactionId,
          input: [
            {
              type: 'function_result',
              callId: 'call_1',
              name: 'search_opportunities',
              result: { ok: true, data: { items: [{ title: 'One' }] } },
            },
            { type: 'text', text: 'Use the results above.' },
          ],
        }),
        new AbortController().signal,
      ),
    );

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(body.messages).toEqual([
      { role: 'system', content: 'Test system instruction' },
      { role: 'user', content: 'Find opportunities in Algiers' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_opportunities',
              arguments: '{"text":"Algiers"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'search_opportunities',
        content: '{"ok":true,"data":{"items":[{"title":"One"}]}}',
      },
      { role: 'user', content: 'Use the results above.' },
    ]);
  });

  it('maps 429 responses to a quota error and logs the upstream status', async () => {
    const { logger, error } = makeLogger();
    const fetchMock = jest.fn(async () =>
      errorResponse(429, {
        error: {
          message: 'Rate limit reached. Please try again in 3.5s.',
          type: 'rate_limit_exceeded',
        },
      }),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock, logger);

    await expect(
      collect(provider.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(ProviderQuotaError);

    const payload = JSON.parse(String(error.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      event: 'ai_agent_provider_failure',
      provider: 'groq',
      status: 429,
      providerCode: 'rate_limit_exceeded',
    });
  });

  it.each([
    [500, LlmServerError],
    [401, LlmProviderUnavailableError],
    [403, LlmProviderUnavailableError],
    [413, LlmProviderUnavailableError],
  ])('maps HTTP %s to %s', async (status, errorType) => {
    const { logger, error } = makeLogger();
    const fetchMock = jest.fn(async () =>
      errorResponse(status, {
        error: {
          message: `Upstream error ${status}`,
          type: 'invalid_request_error',
        },
      }),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock, logger);

    await expect(
      collect(provider.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(errorType);

    const payload = JSON.parse(String(error.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe(status);
  });

  it('fails closed without a key and never calls the network', async () => {
    const fetchMock = jest.fn() as unknown as FetchMock;
    const { logger, error } = makeLogger();
    const provider = new GroqProvider(config, {
      readApiKey: () => undefined,
      fetchImpl: fetchMock,
      logger,
    });

    await expect(
      collect(provider.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(LlmProviderUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();

    const payload = JSON.parse(String(error.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      event: 'ai_agent_provider_failure',
      provider: 'groq',
    });
  });

  it('rejects malformed SSE data as an invalid provider response', async () => {
    const fetchMock = jest.fn(async () =>
      sseResponse(['data: {not-json}\n\n']),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock);

    await expect(
      collect(provider.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(LlmInvalidResponseError);
  });

  it('redacts credentials from logged provider errors', async () => {
    const { logger, error } = makeLogger();
    const fetchMock = jest.fn(async () =>
      errorResponse(401, {
        error: {
          message: 'Invalid key gsk_abcdefghijklmnop and Bearer abcdefghijk',
        },
      }),
    ) as unknown as FetchMock;
    const provider = makeProvider(fetchMock, logger);

    await expect(
      collect(provider.streamTurn(request(), new AbortController().signal)),
    ).rejects.toBeInstanceOf(LlmProviderUnavailableError);

    const raw = String(error.mock.calls[0][0]);
    expect(raw).not.toContain('gsk_abcdefghijklmnop');
    expect(raw).not.toContain('Bearer abcdefghijk');
    expect(raw).toContain('[redacted]');
  });
});
