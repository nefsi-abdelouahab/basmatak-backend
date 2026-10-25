import type { AiAgentLocale } from '../ai-agent.types';
import {
  AiAgentConfig,
  AiAgentLimits,
  defaultAiAgentConfig,
} from '../config/ai-agent.config';
import type { KnowledgeLocale } from '../knowledge/knowledge.types';
import { KnowledgeNormalizer } from '../knowledge/normalizer';
import type {
  RetrievalOptions,
  RetrievalResult,
  RetrievedChunk,
} from '../knowledge/retriever';
import { ToolRegistry } from '../tools/tool-registry';
import {
  defineReadOnlyTool,
  type ReadOnlyTool,
  type ToolIntent,
} from '../tools/tool.types';
import {
  IntentRouter,
  ROUTER_TOP_K,
  type RouterKnowledgeSearch,
} from './intent-router';

function emptyResult(): RetrievalResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason: 'NO_MATCH',
  };
}

function makeChunk(
  text: string,
  score: number,
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk {
  const source = overrides.source ?? 'faq/en.md';
  return {
    id: overrides.id ?? `${source}#1`,
    source,
    title: overrides.title ?? 'FAQ',
    locale: overrides.locale ?? 'en',
    headingTrail: overrides.headingTrail ?? [],
    text,
    charCount: text.length,
    score,
  };
}

function retrieval(chunks: RetrievedChunk[]): RetrievalResult {
  return {
    chunks,
    totalChars: chunks.reduce((total, chunk) => total + chunk.text.length, 0),
    estimatedTokens: 0,
    truncated: false,
  };
}

class StubKnowledgeSearch implements RouterKnowledgeSearch {
  calls: Array<{
    query: string;
    locale?: KnowledgeLocale;
    options?: RetrievalOptions;
  }> = [];

  result: RetrievalResult = emptyResult();
  error: Error | null = null;

  search(
    query: string,
    locale?: KnowledgeLocale,
    options?: RetrievalOptions,
  ): RetrievalResult {
    this.calls.push({ query, locale, options });
    if (this.error) throw this.error;
    return this.result;
  }
}

function readOnlyTool(name: string, intent: ToolIntent): ReadOnlyTool {
  return {
    definition: defineReadOnlyTool({
      name,
      description: `Read-only test tool for ${intent}.`,
      allowedIntents: [intent],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      handler: () => ({ items: [] }),
    }),
  };
}

function makeRegistry(): ToolRegistry {
  return new ToolRegistry([
    readOnlyTool('search_opportunities', 'opportunity_search'),
    readOnlyTool('search_organizations', 'organization_search'),
    readOnlyTool('search_reference_data', 'reference_lookup'),
    readOnlyTool('platform_stats', 'platform_stats'),
  ]);
}

function makeConfig(limits: Partial<AiAgentLimits> = {}): AiAgentConfig {
  const base = defaultAiAgentConfig();
  return { ...base, limits: { ...base.limits, ...limits } };
}

function makeRouter(
  search: RouterKnowledgeSearch,
  limits: Partial<AiAgentLimits> = {},
  normalizer?: KnowledgeNormalizer,
): IntentRouter {
  return new IntentRouter(
    search,
    makeRegistry(),
    makeConfig(limits),
    normalizer,
  );
}

describe('IntentRouter', () => {
  it.each([
    ['English', 'What is Basmatak?', 'en', 'en'],
    ['Arabic', 'ما هو بصمتك؟', 'ar', 'ar'],
    ['French', "Qu'est-ce que Basmatak ?", 'en', 'fr'],
  ] as const)(
    'routes %s knowledge-only questions without tools',
    (_label, message, transportLocale, expectedLanguage) => {
      const search = new StubKnowledgeSearch();
      search.result = retrieval([
        makeChunk('Basmatak is a public volunteering platform.', 3.2),
      ]);
      const router = makeRouter(search);

      const decision = router.route(message, transportLocale as AiAgentLocale);

      expect(decision.intent).toBe('knowledge_only');
      expect(decision.action).toBe('answer');
      expect(decision.language).toBe(expectedLanguage);
      expect(decision.tools).toEqual([]);
      expect(decision.toolIntents).toEqual([]);
      expect(decision.topScore).toBe(3.2);
      expect(decision.knowledgeQuery).toBe(message);
      expect(decision.reason).toBe('KNOWLEDGE_MATCH');
      expect(search.calls).toEqual([
        {
          query: message,
          locale: expectedLanguage,
          options: { topK: ROUTER_TOP_K },
        },
      ]);
    },
  );

  it.each([
    [
      'English opportunities',
      'Show me current opportunities',
      'en',
      'search_opportunities',
      'opportunity_search',
    ],
    [
      'Arabic opportunities',
      'أظهر الفرص المتاحة',
      'ar',
      'search_opportunities',
      'opportunity_search',
    ],
    [
      'French opportunities',
      'Affichez les opportunités disponibles',
      'fr',
      'search_opportunities',
      'opportunity_search',
    ],
    [
      'English organizations',
      'Find verified organizations in Algiers',
      'en',
      'search_organizations',
      'organization_search',
    ],
    [
      'English reference data',
      'List skills and wilayas',
      'en',
      'search_reference_data',
      'reference_lookup',
    ],
  ] as const)(
    'routes %s live-data queries to only the relevant tool',
    (_label, message, expectedLanguage, expectedTool, expectedIntent) => {
      const search = new StubKnowledgeSearch();
      const router = makeRouter(search);

      const decision = router.route(message, 'en');

      expect(decision.intent).toBe('live_data');
      expect(decision.action).toBe('answer');
      expect(decision.language).toBe(expectedLanguage);
      expect(decision.tools.map((tool) => tool.name)).toEqual([expectedTool]);
      expect(decision.toolIntents).toEqual([expectedIntent]);
      expect(decision.topScore).toBe(0);
      expect(decision.knowledgeQuery).toBe(message);
      expect(search.calls).toHaveLength(1);
      expect(search.calls[0].options).toEqual({ topK: ROUTER_TOP_K });
    },
  );

  it('routes a mixed question to knowledge plus the relevant tool', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk(
        'You can apply for current opportunities from the opportunity page.',
        4.1,
      ),
    ]);
    const router = makeRouter(search);
    const message = 'How do I apply for current opportunities?';

    const decision = router.route(message, 'en');

    expect(decision.intent).toBe('mixed');
    expect(decision.action).toBe('answer');
    expect(decision.language).toBe('en');
    expect(decision.tools.map((tool) => tool.name)).toEqual([
      'search_opportunities',
    ]);
    expect(decision.toolIntents).toEqual(['opportunity_search']);
    expect(decision.topScore).toBe(4.1);
    expect(decision.reason).toBe('MIXED');
  });

  it('routes a French mixed question while the transport locale stays en', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk(
        'Vous pouvez postuler aux opportunités disponibles depuis la page.',
        4.4,
      ),
    ]);
    const router = makeRouter(search);
    const message = 'Comment postuler aux opportunités disponibles ?';

    const decision = router.route(message, 'en');

    expect(decision.intent).toBe('mixed');
    expect(decision.language).toBe('fr');
    expect(decision.tools.map((tool) => tool.name)).toEqual([
      'search_opportunities',
    ]);
    expect(decision.toolIntents).toEqual(['opportunity_search']);
  });

  it.each([
    ['English greeting', 'Hello', 'en', 'Hello!'],
    ['Arabic greeting', 'مرحبا', 'ar', 'مرحبًا'],
    ['French greeting', 'Bonjour', 'fr', 'Bonjour'],
    ['English thanks', 'Thanks!', 'en', "You're welcome"],
    ['Arabic thanks', 'شكرا', 'ar', 'على الرحب'],
    ['French thanks', 'Merci beaucoup', 'fr', 'Avec plaisir'],
    ['English capability', 'What can you do?', 'en', 'public information'],
    [
      'French capability',
      'Que peux-tu faire ?',
      'fr',
      'informations publiques',
    ],
    ['Arabic capability', 'ما الذي يمكنك فعله؟', 'ar', 'معلومات بصمتك'],
  ] as const)(
    'returns a short localized direct reply for %s without retrieval or tools',
    (_label, message, expectedLanguage, replySnippet) => {
      const search = new StubKnowledgeSearch();
      const router = makeRouter(search);

      const decision = router.route(message, 'en');

      expect(decision.intent).toBe('greeting');
      expect(decision.action).toBe('direct_reply');
      expect(decision.language).toBe(expectedLanguage);
      expect(decision.directReply).toContain(replySnippet);
      expect(decision.directReply).not.toMatch(/https?:\/\//);
      expect(decision.tools).toEqual([]);
      expect(decision.toolIntents).toEqual([]);
      expect(search.calls).toHaveLength(0);
    },
  );

  it.each([
    [
      'English off-topic',
      'Who won the football match?',
      'en',
      'outside Basmatak',
    ],
    ['Arabic off-topic', 'ما هو الطقس في الجزائر؟', 'ar', 'خارج نطاق'],
    [
      'French off-topic',
      'Quelle est la météo à Paris ?',
      'fr',
      'sort du cadre',
    ],
  ] as const)(
    'refuses %s before retrieval',
    (_label, message, expectedLanguage, replySnippet) => {
      const search = new StubKnowledgeSearch();
      const router = makeRouter(search);

      const decision = router.route(message, 'en');

      expect(decision.intent).toBe('off_topic');
      expect(decision.action).toBe('direct_reply');
      expect(decision.language).toBe(expectedLanguage);
      expect(decision.directReply).toContain(replySnippet);
      expect(decision.tools).toEqual([]);
      expect(decision.toolIntents).toEqual([]);
      expect(search.calls).toHaveLength(0);
    },
  );

  it('clarifies a below-threshold match without treating it as grounding', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk('Quantum physics is a field of science.', 0.5),
    ]);
    const router = makeRouter(search);

    const decision = router.route('Tell me about quantum physics', 'en');

    expect(decision.intent).toBe('clarify');
    expect(decision.action).toBe('direct_reply');
    expect(decision.language).toBe('en');
    expect(decision.directReply).toContain('public Basmatak information');
    expect(decision.tools).toEqual([]);
    expect(decision.toolIntents).toEqual([]);
    expect(decision.topScore).toBe(0.5);
    expect(decision.reason).toBe('LOW_KNOWLEDGE_SCORE');
  });

  it('clarifies an empty retrieval result', () => {
    const search = new StubKnowledgeSearch();
    const router = makeRouter(search);

    const decision = router.route('asdfgh', 'en');

    expect(decision.intent).toBe('clarify');
    expect(decision.action).toBe('direct_reply');
    expect(decision.tools).toEqual([]);
    expect(decision.reason).toBe('LOW_KNOWLEDGE_SCORE');
  });

  it('honors the configured absolute minimum score', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk('Basmatak is a volunteering platform.', 2),
    ]);
    const router = makeRouter(search, { routerMinScore: 3 });

    const decision = router.route('What is Basmatak?', 'en');

    expect(decision.intent).toBe('clarify');
    expect(decision.reason).toBe('LOW_KNOWLEDGE_SCORE');
  });

  it('clamps the minimum score to its conservative hard bounds', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk('Basmatak is a volunteering platform.', 0.6),
    ]);
    const router = makeRouter(search, { routerMinScore: 0 });

    const decision = router.route('What is Basmatak?', 'en');

    expect(decision.intent).toBe('knowledge_only');
    expect(decision.topScore).toBe(0.6);
  });

  it('selects platform_stats only for count questions', () => {
    const search = new StubKnowledgeSearch();
    const router = makeRouter(search);

    const english = router.route('How many opportunities are there?', 'en');
    expect(english.intent).toBe('live_data');
    expect(english.tools.map((tool) => tool.name)).toEqual(['platform_stats']);
    expect(english.toolIntents).toEqual(['platform_stats']);
    expect(english.reason).toBe('LIVE_STATS');

    const arabic = router.route('كم عدد المنظمات الموثقة؟', 'ar');
    expect(arabic.language).toBe('ar');
    expect(arabic.tools.map((tool) => tool.name)).toEqual(['platform_stats']);

    const french = router.route(
      "Combien d'organisations sont vérifiées ?",
      'en',
    );
    expect(french.language).toBe('fr');
    expect(french.tools.map((tool) => tool.name)).toEqual(['platform_stats']);
  });

  it('selects three relevant tools for a broad live-data query, never all four', () => {
    const search = new StubKnowledgeSearch();
    const router = makeRouter(search);

    const decision = router.route(
      "What's available on the platform right now?",
      'en',
    );

    expect(decision.intent).toBe('live_data');
    expect(decision.tools.map((tool) => tool.name)).toEqual([
      'search_opportunities',
      'search_organizations',
      'platform_stats',
    ]);
    expect(decision.toolIntents).toEqual([
      'opportunity_search',
      'organization_search',
      'platform_stats',
    ]);
    expect(decision.toolIntents).not.toContain('reference_lookup');
    expect(decision.tools).toHaveLength(3);
  });

  it('returns only metadata-only tool descriptors', () => {
    const search = new StubKnowledgeSearch();
    const router = makeRouter(search);

    const decision = router.route('Show me current opportunities', 'en');

    expect(decision.tools).toHaveLength(1);
    expect(Object.keys(decision.tools[0])).toEqual(
      expect.arrayContaining([
        'name',
        'description',
        'inputSchema',
        'allowedIntents',
        'readOnly',
      ]),
    );
    expect(Object.keys(decision.tools[0])).not.toContain('handler');
  });

  it('detects French while the transport locale remains en or ar', () => {
    const search = new StubKnowledgeSearch();
    const router = makeRouter(search);

    expect(router.route('Bonjour', 'ar').language).toBe('fr');
    expect(
      router.route('Affichez les opportunités disponibles', 'en').language,
    ).toBe('fr');
    expect(router.route('Hello', 'ar').language).toBe('en');
  });

  it('is repeatable for identical calls', () => {
    const search = new StubKnowledgeSearch();
    search.result = retrieval([
      makeChunk(
        'You can apply for current opportunities from the opportunity page.',
        4.1,
      ),
    ]);
    const router = makeRouter(search);
    const message = 'How do I apply for current opportunities?';

    const first = router.route(message, 'en');
    const second = router.route(message, 'en');

    expect(second).toEqual(first);
    expect(search.calls).toHaveLength(2);
    expect(search.calls[0]).toEqual(search.calls[1]);
  });

  it('does not use the network', () => {
    const globalWithFetch = globalThis as unknown as {
      fetch?: unknown;
    };
    const originalFetch = globalWithFetch.fetch;
    const fetchSpy = jest.fn();
    globalWithFetch.fetch = fetchSpy;

    try {
      const search = new StubKnowledgeSearch();
      const router = makeRouter(search);
      router.route('Show me current opportunities', 'en');
    } finally {
      globalWithFetch.fetch = originalFetch;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a retrieval failure as no grounding without throwing', () => {
    const search = new StubKnowledgeSearch();
    search.error = new Error('retrieval failed');
    const router = makeRouter(search);

    const knowledgeDecision = router.route('What is Basmatak?', 'en');
    expect(knowledgeDecision.intent).toBe('clarify');
    expect(knowledgeDecision.reason).toBe('LOW_KNOWLEDGE_SCORE');

    const liveDecision = router.route('Show me current opportunities', 'en');
    expect(liveDecision.intent).toBe('live_data');
    expect(liveDecision.tools.map((tool) => tool.name)).toEqual([
      'search_opportunities',
    ]);
  });
});
