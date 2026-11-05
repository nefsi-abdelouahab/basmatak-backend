import type { AiAgentChatMessage } from './ai-agent.types';
import {
  deriveConversationFocus,
  focusedOpportunityIndex,
  formatConversationFocus,
  selectFocusedOpportunitySlugs,
} from './conversation-focus';

const OPPORTUNITIES_ANSWER = [
  'Here are the latest published opportunities:',
  '[Beach cleanup](/en/opportunities/beach-cleanup),',
  '[Tree planting](/en/opportunities/tree-planting), and',
  '[Remote tutoring](/en/opportunities/remote-tutoring).',
  'You can browse more on the [Opportunities page](/en/opportunities).',
].join(' ');

const ORGANIZATIONS_ANSWER =
  'I found: [Green Earth](/en/orgs/green-earth) and [Blue Sky](/en/orgs/blue-sky).';

function history(
  ...messages: Array<[AiAgentChatMessage['role'], string]>
): AiAgentChatMessage[] {
  return messages.map(([role, content]) => ({ role, content }));
}

describe('conversation focus', () => {
  it('derives opportunities newest-first from assistant markdown links', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me opportunities'],
        ['assistant', OPPORTUNITIES_ANSWER],
        ['user', 'هل هي مفتوحة'],
      ),
    );

    expect(focus?.topic).toBe('opportunity_search');
    expect(focus?.opportunities.map((item) => item.slug)).toEqual([
      'beach-cleanup',
      'tree-planting',
      'remote-tutoring',
    ]);
    expect(focus?.opportunities[0]?.title).toBe('Beach cleanup');
    expect(focus?.organizations).toEqual([]);
  });

  it('keeps only locale-prefixed public entity links and ignores browse links', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me opportunities'],
        [
          'assistant',
          [
            '[Bad](https://example.com/en/opportunities/evil)',
            '[Also bad](/en/opportunities/one/extra)',
            '[Good](/ar/opportunities/good-one)',
            '[Browse](/ar/opportunities)',
          ].join(' '),
        ],
      ),
    );

    expect(focus?.opportunities.map((item) => item.slug)).toEqual(['good-one']);
  });

  it('caps each entity kind at three and fills from older answers', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'first list'],
        [
          'assistant',
          '[A](/en/opportunities/a) [B](/en/opportunities/b) [C](/en/opportunities/c)',
        ],
        ['user', 'second list'],
        ['assistant', '[D](/en/opportunities/d) [A](/en/opportunities/a)'],
      ),
    );

    expect(focus?.opportunities.map((item) => item.slug)).toEqual([
      'd',
      'a',
      'b',
    ]);
  });

  it('derives an organization lookup topic and typed name from the latest user turn', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'هل تعرف جمعية نور'],
        ['assistant', 'سأتحقق من معلومات جمعية نور لك.'],
      ),
    );

    expect(focus?.topic).toBe('organization_lookup');
    expect(focus?.organizationName).toBe('نور');
  });

  it('falls back to the focused organization link for the name', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me organizations'],
        ['assistant', ORGANIZATIONS_ANSWER],
        ['user', 'هل تحققت'],
      ),
    );

    expect(focus?.topic).toBe('organization_lookup');
    expect(focus?.organizationName).toBe('Green Earth');
  });

  it('returns undefined when history has no entities and no topic', () => {
    expect(
      deriveConversationFocus(
        history(
          ['user', 'How does verification work?'],
          ['assistant', 'The organization reviews the evidence.'],
        ),
      ),
    ).toBeUndefined();
  });

  it.each([
    ['الأولى', 0],
    ['الفرصة الأولى', 0],
    ['الثانية', 1],
    ['الفرصة الثانية', 1],
    ['الثالثة', 2],
    ['the first one', 0],
    ['is the first', 0],
    ['tell me about the second', 1],
    ['the third', 2],
  ] as const)('resolves the ordinal in %s', (message, expected) => {
    expect(focusedOpportunityIndex(message)).toBe(expected);
  });

  it.each([
    'هل هي مفتوحة',
    'the first step',
    'show me opportunities',
    'فرصة جديدة',
  ])('does not treat %s as an ordinal follow-up', (message) => {
    expect(focusedOpportunityIndex(message)).toBeUndefined();
  });

  it('selects one slug for an ordinal and the whole list otherwise', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me opportunities'],
        ['assistant', OPPORTUNITIES_ANSWER],
      ),
    );

    expect(
      selectFocusedOpportunitySlugs('tell me about the second', focus),
    ).toEqual(['tree-planting']);
    expect(selectFocusedOpportunitySlugs('هل هي مفتوحة', focus)).toEqual([
      'beach-cleanup',
      'tree-planting',
      'remote-tutoring',
    ]);
    expect(
      selectFocusedOpportunitySlugs('tell me about the third', focus),
    ).toEqual(['remote-tutoring']);
  });

  it('returns no slugs when there is no focus or the ordinal is out of range', () => {
    expect(selectFocusedOpportunitySlugs('الأولى', undefined)).toBeUndefined();
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me opportunities'],
        ['assistant', '[Only one](/en/opportunities/only-one)'],
      ),
    );
    expect(selectFocusedOpportunitySlugs('الثانية', focus)).toBeUndefined();
  });

  it('formats a bounded hidden focus line', () => {
    const focus = deriveConversationFocus(
      history(
        ['user', 'show me opportunities'],
        ['assistant', OPPORTUNITIES_ANSWER],
        ['user', 'show me organizations'],
        ['assistant', ORGANIZATIONS_ANSWER],
      ),
    );

    const line = formatConversationFocus(focus!);
    expect(line).toContain(
      'Previously shown opportunities: Beach cleanup (beach-cleanup)',
    );
    expect(line).toContain(
      'Previously shown organizations: Green Earth (green-earth)',
    );
    expect(line).toContain('Previous topic: organization_lookup.');
    expect(line.length).toBeLessThan(700);
  });
});
