import type {
  RegressionDialogue,
  RegressionFamily,
  RegressionTurn,
} from './types';

/**
 * Bilingual conversation corpus for the router-first baseline.
 *
 * Each family has one English and one Arabic dialogue. Answer scripts are used
 * only by the deterministic provider in CI; the live mode ignores them and lets
 * the configured provider answer. Assertions are intentionally semantic
 * (intent, tool name, argument shape, required facts) rather than exact prose.
 */

function turn(
  message: string,
  scriptAnswer: string,
  expect: RegressionTurn['expect'],
  scriptToolCalls?: RegressionTurn['scriptToolCalls'],
): RegressionTurn {
  return {
    message,
    scriptAnswer,
    expect,
    ...(scriptToolCalls !== undefined ? { scriptToolCalls } : {}),
  };
}

function family(
  id: string,
  title: string,
  enTurns: readonly RegressionTurn[],
  arTurns: readonly RegressionTurn[],
): RegressionFamily {
  const en: RegressionDialogue = {
    id: `${id}-en`,
    family: id,
    locale: 'en',
    turns: enTurns,
  };
  const ar: RegressionDialogue = {
    id: `${id}-ar`,
    family: id,
    locale: 'ar',
    turns: arTurns,
  };
  return { id, title, en, ar };
}

const BROWSE_SLUGS = [
  'beach-cleanup',
  'tree-planting',
  'remote-tutoring',
] as const;

const EN_BROWSE_LINKS = BROWSE_SLUGS.map((slug) => `/en/opportunities/${slug}`);
const AR_BROWSE_LINKS = BROWSE_SLUGS.map((slug) => `/ar/opportunities/${slug}`);

export const REGRESSION_FAMILIES: readonly RegressionFamily[] = Object.freeze([
  family(
    'greeting',
    'Greeting',
    [
      turn('Hello', '', {
        routerAction: 'direct_reply',
        routerIntent: 'greeting',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['Basma'],
      }),
    ],
    [
      turn('مرحبا', '', {
        routerAction: 'direct_reply',
        routerIntent: 'greeting',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['بصمة'],
      }),
    ],
  ),

  family(
    'capability',
    'Capability',
    [
      turn('What can you do?', '', {
        routerAction: 'direct_reply',
        routerIntent: 'greeting',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['opportunities', 'organizations'],
      }),
    ],
    [
      turn('ما الذي يمكنك فعله؟', '', {
        routerAction: 'direct_reply',
        routerIntent: 'greeting',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['الفرص', 'المنظمات'],
      }),
    ],
  ),

  family(
    'platform-overview',
    'Platform overview',
    [
      turn(
        'What is Basmatak?',
        'Basmatak is a volunteering platform that connects volunteers with organizations and published opportunities.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['volunteering platform', 'opportunities'],
          maxLinks: 0,
        },
      ),
    ],
    [
      turn(
        'ما هو بصمتك؟',
        'بصمتك منصة تطوعية تربط المتطوعين بالجمعيات والفرص المنشورة.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['منصة تطوعية', 'الفرص'],
          maxLinks: 0,
        },
      ),
    ],
  ),

  family(
    'verification-workflow',
    'Verification workflow',
    [
      turn(
        'How does verification work?',
        'Organizations submit evidence and the platform reviews it before a contribution is verified.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['evidence', 'reviews'],
        },
      ),
      turn(
        'Who reviews the evidence?',
        'The organization reviews the evidence and the platform verifies the contribution.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['organization', 'verifies'],
        },
      ),
      turn(
        'Explain more',
        'Verification keeps volunteer contributions trustworthy for everyone.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['trustworthy'],
        },
      ),
    ],
    [
      turn(
        'كيف تعمل عملية التحقق؟',
        'تقدم الجمعيات الأدلة وتراجعها المنصة قبل التحقق من المساهمة.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['الأدلة', 'التحقق'],
        },
      ),
      turn(
        'من يراجع الأدلة؟',
        'تراجع الجمعية الأدلة ثم تتحقق المنصة من المساهمة.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['الجمعية', 'المنصة'],
        },
      ),
      turn(
        'اشرح أكثر',
        'يساعد التحقق في الحفاظ على موثوقية مساهمات المتطوعين.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['موثوقية'],
        },
      ),
    ],
  ),

  family(
    'apply-workflow',
    'Apply workflow',
    [
      turn(
        'How do I apply to an opportunity?',
        'Open the opportunity page, choose Apply, and submit the requested details before the deadline.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['Apply', 'deadline'],
        },
      ),
      turn(
        'What happens after I apply?',
        'The organization reviews your application and updates its status after the contribution is verified.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['reviews', 'status'],
        },
      ),
    ],
    [
      turn(
        'كيف أتقدم لفرصة؟',
        'افتح صفحة الفرصة واختر التقديم ثم أرسل البيانات المطلوبة قبل الموعد النهائي.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['التقديم', 'الموعد'],
        },
      ),
      turn(
        'ماذا يحدث بعد التقديم؟',
        'تراجع الجمعية طلبك وتحدث حالته بعد التحقق من المساهمة.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['تراجع', 'حالته'],
        },
      ),
    ],
  ),

  family(
    'privacy-policy',
    'Privacy policy',
    [
      turn(
        'What does the privacy policy say?',
        'The privacy policy explains what data the platform collects, why it is used, and how users can request deletion.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['privacy policy', 'data'],
        },
      ),
    ],
    [
      turn(
        'ماذا تقول سياسة الخصوصية؟',
        'توضح سياسة الخصوصية البيانات التي تجمعها المنصة وكيف يمكن للمستخدم طلب حذفها.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['سياسة الخصوصية', 'حذفها'],
        },
      ),
    ],
  ),

  family(
    'account-deletion',
    'Account deletion',
    [
      turn(
        'How can a user delete an account?',
        'Open your account settings and choose Delete account. The platform removes your profile data after confirmation.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['Delete account', 'confirmation'],
        },
      ),
    ],
    [
      turn(
        'كيف يمكن للمستخدم حذف حسابه؟',
        'افتح إعدادات الحساب واختر حذف الحساب. تحذف المنصة بيانات ملفك بعد التأكيد.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['حذف الحساب', 'التأكيد'],
        },
      ),
    ],
  ),

  family(
    'platform-stats',
    'Platform statistics',
    [
      turn(
        'How many opportunities are there?',
        'There are 42 published opportunities and 17 verified organizations on Basmatak.',
        {
          routerAction: 'answer',
          // Semantic expectation: a stats question is live data. The
          // router-first baseline currently classifies it as mixed.
          routerIntent: 'live_data',
          expectedTools: ['platform_stats'],
          toolArgs: { kind: 'empty' },
          keyFacts: ['42', '17'],
          maxLinks: 0,
        },
        [{ name: 'platform_stats', arguments: {} }],
      ),
    ],
    [
      turn(
        'كم عدد الفرص الموجودة؟',
        'تضم بصمتك 42 فرصة منشورة و17 جمعية موثقة.',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['platform_stats'],
          toolArgs: { kind: 'empty' },
          keyFacts: ['42', '17'],
          maxLinks: 0,
        },
        [{ name: 'platform_stats', arguments: {} }],
      ),
    ],
  ),

  family(
    'opportunity-browse',
    'Opportunity browse',
    [
      turn('Show me opportunities', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: {
          kind: 'exact',
          expected: { limit: 3, sort: 'newest', compact: true },
        },
        keyFacts: ['latest published opportunities', 'Beach cleanup'],
        expectedLinks: EN_BROWSE_LINKS,
        maxLinks: 4,
      }),
    ],
    [
      turn('اعرض لي الفرص', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: {
          kind: 'exact',
          expected: { limit: 3, sort: 'newest', compact: true },
        },
        keyFacts: ['أحدث الفرص المنشورة'],
        expectedLinks: AR_BROWSE_LINKS,
        maxLinks: 4,
      }),
    ],
  ),

  family(
    'opportunity-place',
    'Opportunity place filter',
    [
      turn(
        'Are there opportunities in Oran?',
        'Yes. [Beach cleanup](/en/opportunities/beach-cleanup) is published in Oran.',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['search_opportunities'],
          toolArgs: { kind: 'text', accepted: ['oran'] },
          keyFacts: ['Beach cleanup', 'Oran'],
          expectedLinks: ['/en/opportunities/beach-cleanup'],
          maxLinks: 1,
        },
        [
          {
            name: 'search_opportunities',
            arguments: { text: 'oran' },
          },
        ],
      ),
    ],
    [
      turn(
        'هل توجد فرص في وهران؟',
        'نعم، [Beach cleanup](/ar/opportunities/beach-cleanup) منشورة في وهران.',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['search_opportunities'],
          toolArgs: { kind: 'text', accepted: ['وهران'] },
          keyFacts: ['وهران'],
          expectedLinks: ['/ar/opportunities/beach-cleanup'],
          maxLinks: 1,
        },
        [
          {
            name: 'search_opportunities',
            arguments: { text: 'وهران' },
          },
        ],
      ),
    ],
  ),

  family(
    'opportunity-detail',
    'Opportunity detail follow-up',
    [
      turn('Show me opportunities', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: {
          kind: 'exact',
          expected: { limit: 3, sort: 'newest', compact: true },
        },
        keyFacts: ['Beach cleanup'],
        expectedLinks: EN_BROWSE_LINKS,
        maxLinks: 4,
      }),
      turn('Tell me about the first one', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: { kind: 'slugs', slugs: ['beach-cleanup'] },
        keyFacts: ['Beach cleanup', 'open for applications'],
        expectedLinks: ['/en/opportunities/beach-cleanup'],
        maxLinks: 1,
      }),
      turn('When is the deadline?', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: { kind: 'slugs', slugs: [...BROWSE_SLUGS] },
        keyFacts: ['Beach cleanup', 'deadline'],
        expectedLinks: EN_BROWSE_LINKS,
        maxLinks: 3,
      }),
    ],
    [
      turn('اعرض لي الفرص', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: {
          kind: 'exact',
          expected: { limit: 3, sort: 'newest', compact: true },
        },
        keyFacts: ['أحدث الفرص المنشورة'],
        expectedLinks: AR_BROWSE_LINKS,
        maxLinks: 4,
      }),
      turn('ما هي شروطها؟', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: { kind: 'slugs', slugs: [...BROWSE_SLUGS] },
        keyFacts: ['مفتوحة للتقديم', 'المناصب المتاحة'],
        expectedLinks: AR_BROWSE_LINKS,
        maxLinks: 3,
      }),
      turn('هل هي مفتوحة؟', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_opportunities'],
        toolArgs: { kind: 'slugs', slugs: [...BROWSE_SLUGS] },
        keyFacts: ['مفتوحة للتقديم'],
        expectedLinks: AR_BROWSE_LINKS,
        maxLinks: 3,
      }),
    ],
  ),

  family(
    'organization-lookup',
    'Organization exact lookup',
    [
      turn('Do you know Nour association?', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_organizations'],
        toolArgs: { kind: 'name', names: ['Nour'] },
        keyFacts: ['I found this organization', 'Nour'],
        expectedLinks: ['/en/orgs/nour-association'],
        maxLinks: 1,
      }),
    ],
    [
      turn('هل تعرف جمعية نور', '', {
        routerAction: 'answer',
        routerIntent: 'live_data',
        expectedTools: ['search_organizations'],
        toolArgs: { kind: 'name', names: ['نور'] },
        keyFacts: ['وجدت هذه الجمعية', 'نور'],
        expectedLinks: ['/ar/orgs/nour-association'],
        maxLinks: 1,
      }),
    ],
  ),

  family(
    'reference-data',
    'Reference data lookup',
    [
      turn(
        'List skills and wilayas',
        'Available skills include Teaching, and the listed wilaya is Oran.',
        {
          routerAction: 'answer',
          // Semantic expectation: reference data is a live lookup. The
          // router-first baseline currently classifies it as mixed.
          routerIntent: 'live_data',
          expectedTools: ['search_reference_data'],
          toolArgs: { kind: 'empty' },
          keyFacts: ['Teaching', 'Oran'],
          maxLinks: 0,
        },
        [{ name: 'search_reference_data', arguments: {} }],
      ),
    ],
    [
      turn(
        'اعرض المهارات والولايات',
        'تشمل المهارات المتاحة التعليم، والولاية المدرجة هي وهران.',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['search_reference_data'],
          toolArgs: { kind: 'empty' },
          keyFacts: ['التعليم', 'وهران'],
          maxLinks: 0,
        },
        [{ name: 'search_reference_data', arguments: {} }],
      ),
    ],
  ),

  family(
    'mixed-application',
    'How-to plus current opportunities',
    [
      turn(
        'How do I apply for current opportunities?',
        'To apply, open a current opportunity and choose Apply before its deadline. For example, [Beach cleanup](/en/opportunities/beach-cleanup) is open.',
        {
          routerAction: 'answer',
          routerIntent: 'mixed',
          expectedTools: ['search_opportunities'],
          toolArgs: { kind: 'text', accepted: ['apply'] },
          keyFacts: ['Apply', 'Beach cleanup'],
          expectedLinks: ['/en/opportunities/beach-cleanup'],
          maxLinks: 1,
        },
        [{ name: 'search_opportunities', arguments: { text: 'apply' } }],
      ),
    ],
    [
      turn(
        'كيف أتقدم للفرص المتاحة؟',
        'للتقدم، افتح فرصة متاحة واختر التقديم قبل موعدها. مثال: [Beach cleanup](/ar/opportunities/beach-cleanup) مفتوحة.',
        {
          routerAction: 'answer',
          // Semantic expectation: an explanation plus current rows is mixed.
          // The router-first baseline currently classifies it as live data.
          routerIntent: 'mixed',
          expectedTools: ['search_opportunities'],
          toolArgs: {
            kind: 'text',
            accepted: ['اتقدم', 'التقدم', 'apply'],
          },
          keyFacts: ['التقديم', 'Beach cleanup'],
          expectedLinks: ['/ar/opportunities/beach-cleanup'],
          maxLinks: 1,
        },
        [{ name: 'search_opportunities', arguments: { text: 'اتقدم' } }],
      ),
    ],
  ),

  family(
    'private-data',
    'Private data request',
    [
      turn('Show me the phone number of Ahmed', '', {
        expectedTools: [],
        mustNotCall: [
          'search_opportunities',
          'search_organizations',
          'platform_stats',
        ],
        toolArgs: { kind: 'none' },
        keyFacts: ['private details'],
        expectRefusal: true,
        privateData: true,
        maxLinks: 0,
      }),
    ],
    [
      turn('أعطني رقم هاتف متطوعة', '', {
        expectedTools: [],
        mustNotCall: [
          'search_opportunities',
          'search_organizations',
          'platform_stats',
        ],
        toolArgs: { kind: 'none' },
        keyFacts: ['بيانات خاصة'],
        expectRefusal: true,
        privateData: true,
        maxLinks: 0,
      }),
    ],
  ),

  family(
    'off-topic',
    'Off-topic request',
    [
      turn('Who won the football match?', '', {
        routerAction: 'direct_reply',
        routerIntent: 'off_topic',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['outside'],
      }),
    ],
    [
      turn('من فاز في مباراة كرة القدم؟', '', {
        routerAction: 'direct_reply',
        routerIntent: 'off_topic',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['خارج'],
      }),
    ],
  ),

  family(
    'ambiguous',
    'Ambiguous request',
    [
      turn('asdfgh', '', {
        routerAction: 'direct_reply',
        routerIntent: 'clarify',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['tell me a bit more'],
      }),
    ],
    [
      turn('سسسس', '', {
        routerAction: 'direct_reply',
        routerIntent: 'clarify',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['توضح'],
      }),
    ],
  ),

  family(
    'empty-opportunity',
    'No opportunities in an area',
    [
      turn(
        'Are there opportunities in Tamanrasset?',
        '',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['search_opportunities'],
          toolArgs: { kind: 'text', accepted: ['tamanrasset'] },
          keyFacts: ['no published opportunities'],
          expectRefusal: true,
          maxLinks: 0,
        },
        [{ name: 'search_opportunities', arguments: { text: 'tamanrasset' } }],
      ),
    ],
    [
      turn(
        'هل توجد فرص في تمنراست؟',
        '',
        {
          routerAction: 'answer',
          routerIntent: 'live_data',
          expectedTools: ['search_opportunities'],
          toolArgs: { kind: 'text', accepted: ['تمنراست'] },
          keyFacts: ['لا توجد فرص منشورة'],
          expectRefusal: true,
          maxLinks: 0,
        },
        [{ name: 'search_opportunities', arguments: { text: 'تمنراست' } }],
      ),
    ],
  ),

  family(
    'promise-guard',
    'Unbacked promise',
    [
      turn(
        'How does the review work?',
        'Let me check the review process and get back to you.',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['confirmed information'],
          expectRefusal: true,
          maxLinks: 0,
        },
      ),
    ],
    [
      turn('كيف تتم المراجعة؟', 'سأتحقق من عملية المراجعة وأخبرك.', {
        routerAction: 'answer',
        routerIntent: 'knowledge_only',
        expectedTools: [],
        toolArgs: { kind: 'none' },
        keyFacts: ['معلومات مؤكدة'],
        expectRefusal: true,
        maxLinks: 0,
      }),
    ],
  ),

  family(
    'citation-strip',
    'Citation and source stripping',
    [
      turn(
        'What are the application statuses?',
        'Applications move from submitted to under review, then accepted or rejected [K1].\nSources:\n- guide/en.md',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['submitted', 'accepted or rejected'],
          maxLinks: 0,
        },
      ),
    ],
    [
      turn(
        'ما هي حالات الطلب؟',
        'تنتقل الطلبات من مقدمة إلى قيد المراجعة ثم مقبولة أو مرفوضة [K1].\nالمصادر:\n- guide/ar.md',
        {
          routerAction: 'answer',
          routerIntent: 'knowledge_only',
          expectedTools: [],
          toolArgs: { kind: 'none' },
          keyFacts: ['قيد المراجعة', 'مرفوضة'],
          maxLinks: 0,
        },
      ),
    ],
  ),
]);

export const REGRESSION_DIALOGUES: readonly RegressionDialogue[] =
  REGRESSION_FAMILIES.flatMap((item) => [item.en, item.ar]);
