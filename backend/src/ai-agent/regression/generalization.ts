import type {
  RegressionDialogue,
  RegressionFamily,
  RegressionTurn,
} from './types';

/**
 * Generalization corpus (Phase 1).
 *
 * Fifteen bilingual families (30 dialogues) with phrasing that is deliberately
 * absent from the original regression corpus: unseen synonyms, light dialect,
 * typos, ordinals, pronouns, yes/no confirmations, raw slugs, and topic
 * switches. Assertions stay semantic so live runs are not graded on prose.
 *
 * Scripts are used only by the offline deterministic provider. They include the
 * tool call the model-first path is expected to make, so a missing declaration
 * or a router-first classification change still surfaces as a failed turn.
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

const EN_LINKS = [
  '/en/opportunities/beach-cleanup',
  '/en/opportunities/tree-planting',
  '/en/opportunities/remote-tutoring',
] as const;
const AR_LINKS = [
  '/ar/opportunities/beach-cleanup',
  '/ar/opportunities/tree-planting',
  '/ar/opportunities/remote-tutoring',
] as const;

const EN_BROWSE_ANSWER =
  'Here are a few current opportunities: [Beach cleanup](/en/opportunities/beach-cleanup), [Tree planting](/en/opportunities/tree-planting), and [Remote tutoring](/en/opportunities/remote-tutoring).';
const AR_BROWSE_ANSWER =
  'إليك بعض الفرص الحالية: [Beach cleanup](/ar/opportunities/beach-cleanup) و[Tree planting](/ar/opportunities/tree-planting) و[Remote tutoring](/ar/opportunities/remote-tutoring).';

const BROWSE_SCRIPT = [
  {
    name: 'search_opportunities',
    arguments: { limit: 3, sort: 'newest', compact: true },
  },
] as const;

const BROWSE_EXPECT = {
  expectedTools: ['search_opportunities'],
  toolArgs: {
    kind: 'exact' as const,
    expected: { limit: 3, sort: 'newest', compact: true },
  },
  keyFacts: ['Beach cleanup'],
  expectedLinks: EN_LINKS,
  maxLinks: 4,
};

const AR_BROWSE_EXPECT = {
  expectedTools: ['search_opportunities'],
  toolArgs: {
    kind: 'exact' as const,
    expected: { limit: 3, sort: 'newest', compact: true },
  },
  keyFacts: ['Beach cleanup'],
  expectedLinks: AR_LINKS,
  maxLinks: 4,
};

export const GENERALIZATION_FAMILIES: readonly RegressionFamily[] =
  Object.freeze([
    family(
      'gen-browse-dialect',
      'Browse with dialect and synonyms',
      [
        turn(
          'any volunteer gigs happening around me?',
          EN_BROWSE_ANSWER,
          BROWSE_EXPECT,
          [...BROWSE_SCRIPT],
        ),
      ],
      [
        turn('وين نلقى فرص تطوعية قريبة؟', AR_BROWSE_ANSWER, AR_BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
      ],
    ),

    family(
      'gen-stats-typo',
      'Statistics with a typo',
      [
        turn(
          'how many oportunities r listed?',
          'There are 42 published opportunities and 17 verified organizations.',
          {
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
          'قداش عدد الجمعيات المسجلة؟',
          'تضم المنصة 42 فرصة منشورة و17 جمعية موثقة.',
          {
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
      'gen-org-dialect',
      'Organization lookup with dialect',
      [
        turn(
          'know any charity called Nour?',
          'I found [Nour](/en/orgs/nour-association).',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['Nour'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'Nour', limit: 8 },
            },
          ],
        ),
      ],
      [
        turn(
          'واش تعرف جمعية نور؟',
          'وجدت [Nour](/ar/orgs/nour-association).',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['نور'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'نور', limit: 8 },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-reference-synonyms',
      'Reference lookup with synonyms',
      [
        turn(
          'what skills and regions can I choose from?',
          'Teaching is listed, and Oran is one of the available regions.',
          {
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
          'أيش المهارات والولايات المتاحة؟',
          'تشمل المهارات التعليم، ومن الولايات المتاحة وهران.',
          {
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
      'gen-knowledge-followup',
      'Knowledge follow-up with unseen wording',
      [
        turn(
          'how does verification work?',
          'Organizations submit evidence and the platform reviews it.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['evidence', 'platform'],
            maxLinks: 0,
          },
        ),
        turn(
          'and who checks it?',
          'The platform checks the evidence after the organization submits it.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['platform', 'evidence'],
            maxLinks: 0,
          },
        ),
      ],
      [
        turn(
          'كيفاش تتم عملية التحقق؟',
          'تقدم الجمعيات الأدلة وتراجعها المنصة.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['الأدلة', 'المنصة'],
            maxLinks: 0,
          },
        ),
        turn(
          'اشرح أكثر',
          'يساعد التحقق في الحفاظ على موثوقية مساهمات المتطوعين، لأن المنصة تراجع الأدلة قبل اعتماد المساهمة.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['المنصة', 'الأدلة'],
            maxLinks: 0,
          },
        ),
      ],
    ),

    family(
      'gen-ordinal-first',
      'Ordinal first item',
      [
        turn('show me what is available', EN_BROWSE_ANSWER, BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
        turn(
          'Tell me about the first one',
          'Beach cleanup is open for applications with five positions in Oran: [Beach cleanup](/en/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'open for applications'],
            expectedLinks: ['/en/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
      [
        turn('اعرض لي الفرص', AR_BROWSE_ANSWER, AR_BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
        turn(
          'أخبرني عن الأولى',
          'فرصة Beach cleanup مفتوحة للتقديم وفيها خمسة مناصب في وهران: [Beach cleanup](/ar/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'مفتوحة'],
            expectedLinks: ['/ar/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-pronoun-summary',
      'Pronoun summary',
      [
        turn('show me what is available', EN_BROWSE_ANSWER, BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
        turn(
          'give me a quick summary about it',
          'Beach cleanup is a published opportunity in Oran with five open positions: [Beach cleanup](/en/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'Oran'],
            expectedLinks: ['/en/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
      [
        turn('اعرض لي الفرص', AR_BROWSE_ANSWER, AR_BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
        turn(
          'قدم لي نبذة عنها',
          'فرصة Beach cleanup منشورة في وهران وفيها خمسة مناصب متاحة: [Beach cleanup](/ar/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'وهران'],
            expectedLinks: ['/ar/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-yesno-confirm',
      'Yes/no pending confirmation',
      [
        turn(
          'do you know Nour association?',
          'Did you mean [Nour](/en/orgs/nour-association)?',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['Nour'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'Nour', limit: 8 },
            },
          ],
        ),
        turn(
          'yes',
          'Nour is a verified association on Basmatak. Here is its public profile: [Nour](/en/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: {
              kind: 'exact',
              expected: { slug: 'nour-association' },
            },
            keyFacts: ['Nour', 'verified'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { slug: 'nour-association' },
            },
          ],
        ),
      ],
      [
        turn(
          'تعرف جمعية نور؟',
          'هل تقصد [Nour](/ar/orgs/nour-association)؟',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['نور'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'نور', limit: 8 },
            },
          ],
        ),
        turn(
          'نعم',
          'نعم، Nour جمعية موثقة على بصمتك، وهذا ملفها العام: [Nour](/ar/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: {
              kind: 'exact',
              expected: { slug: 'nour-association' },
            },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { slug: 'nour-association' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-lookup-confirm',
      'Lookup confirmation',
      [
        turn(
          'what about Nour association?',
          'I found [Nour](/en/orgs/nour-association).',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['Nour'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'Nour' },
            },
          ],
        ),
        turn(
          'did you check?',
          'Yes, Nour is still listed as a verified association: [Nour](/en/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: {
              kind: 'exact',
              expected: { slug: 'nour-association' },
            },
            keyFacts: ['Nour', 'verified'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { slug: 'nour-association' },
            },
          ],
        ),
      ],
      [
        turn(
          'وماذا عن جمعية نور؟',
          'وجدت [Nour](/ar/orgs/nour-association).',
          {
            expectedTools: ['search_organizations'],
            toolArgs: { kind: 'name', names: ['نور'] },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'search_organizations',
              arguments: { name: 'نور' },
            },
          ],
        ),
        turn(
          'هل تحققت',
          'نعم، Nour ما زالت جمعية موثقة على المنصة: [Nour](/ar/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: {
              kind: 'exact',
              expected: { slug: 'nour-association' },
            },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { slug: 'nour-association' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-slug-reference',
      'Raw slug reference',
      [
        turn(
          'show me beach-cleanup details',
          'Beach cleanup is open for applications with five positions in Oran: [Beach cleanup](/en/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'Oran'],
            expectedLinks: ['/en/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
      [
        turn(
          'أعطني تفاصيل beach-cleanup',
          'فرصة Beach cleanup مفتوحة للتقديم وفيها خمسة مناصب في وهران: [Beach cleanup](/ar/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'وهران'],
            expectedLinks: ['/ar/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-topic-switch',
      'Topic switch',
      [
        turn(
          'what are the application statuses?',
          'Applications move from submitted to under review, then accepted or rejected.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['submitted', 'under review'],
            maxLinks: 0,
          },
        ),
        turn('now show me what is open', EN_BROWSE_ANSWER, BROWSE_EXPECT, [
          ...BROWSE_SCRIPT,
        ]),
      ],
      [
        turn(
          'ما هي حالات الطلب؟',
          'تنتقل الطلبات من مقدمة إلى قيد المراجعة ثم مقبولة أو مرفوضة.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['قيد المراجعة', 'مرفوضة'],
            maxLinks: 0,
          },
        ),
        turn(
          'والآن ما هي الفرص المفتوحة؟',
          AR_BROWSE_ANSWER,
          AR_BROWSE_EXPECT,
          [...BROWSE_SCRIPT],
        ),
      ],
    ),

    family(
      'gen-detail-org',
      'Organization detail tool',
      [
        turn(
          'tell me more about Nour association',
          'Nour is a verified association on Basmatak. Here is its public profile: [Nour](/en/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: { kind: 'exact', expected: { name: 'Nour' } },
            keyFacts: ['Nour', 'verified'],
            expectedLinks: ['/en/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { name: 'Nour' },
            },
          ],
        ),
      ],
      [
        turn(
          'أعطني معلومات أكثر عن جمعية نور',
          'Nour جمعية موثقة على بصمتك، وهذا ملفها العام: [Nour](/ar/orgs/nour-association).',
          {
            expectedTools: ['get_organization_details'],
            toolArgs: { kind: 'exact', expected: { name: 'نور' } },
            keyFacts: ['Nour'],
            expectedLinks: ['/ar/orgs/nour-association'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_organization_details',
              arguments: { name: 'نور' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-status-check',
      'Specific opportunity status',
      [
        turn(
          'is beach cleanup still open?',
          'Yes, Beach cleanup is open for applications: [Beach cleanup](/en/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'open for applications'],
            expectedLinks: ['/en/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
      [
        turn(
          'هل فرصة beach-cleanup ما زالت مفتوحة؟',
          'نعم، فرصة Beach cleanup مفتوحة للتقديم: [Beach cleanup](/ar/opportunities/beach-cleanup).',
          {
            expectedTools: ['get_opportunity_details'],
            toolArgs: { kind: 'exact', expected: { slug: 'beach-cleanup' } },
            keyFacts: ['Beach cleanup', 'مفتوحة'],
            expectedLinks: ['/ar/opportunities/beach-cleanup'],
            maxLinks: 1,
          },
          [
            {
              name: 'get_opportunity_details',
              arguments: { slug: 'beach-cleanup' },
            },
          ],
        ),
      ],
    ),

    family(
      'gen-privacy',
      'Private data still refused',
      [
        turn('what is the email address of Ahmed?', '', {
          expectedTools: [],
          mustNotCall: [
            'search_opportunities',
            'search_organizations',
            'platform_stats',
            'get_organization_details',
          ],
          toolArgs: { kind: 'none' },
          keyFacts: ['private details'],
          expectRefusal: true,
          privateData: true,
          maxLinks: 0,
        }),
      ],
      [
        turn('أعطني بريد المستخدمة', '', {
          expectedTools: [],
          mustNotCall: [
            'search_opportunities',
            'search_organizations',
            'platform_stats',
            'get_organization_details',
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
      'gen-off-topic-dialect',
      'Off-topic with dialect',
      [
        turn(
          'suggest a movie for tonight',
          "That's outside what I can help with, but I can help you find volunteering opportunities.",
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['outside'],
            maxLinks: 0,
          },
        ),
      ],
      [
        turn(
          'اقترح لي فيلم الليلة',
          'هذا خارج ما أستطيع مساعدتك فيه، لكن يمكنني مساعدتك في إيجاد فرصة تطوعية.',
          {
            expectedTools: [],
            toolArgs: { kind: 'none' },
            keyFacts: ['خارج'],
            maxLinks: 0,
          },
        ),
      ],
    ),
  ]);

export const GENERALIZATION_DIALOGUES: readonly RegressionDialogue[] =
  GENERALIZATION_FAMILIES.flatMap((item) => [item.en, item.ar]);
