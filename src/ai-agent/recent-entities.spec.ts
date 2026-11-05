import type { AiAgentChatMessage } from './ai-agent.types';
import {
  deriveRecentEntities,
  formatRecentEntities,
  resolveRecentReference,
} from './recent-entities';

function messages(
  ...items: Array<[AiAgentChatMessage['role'], string]>
): AiAgentChatMessage[] {
  return items.map(([role, content]) => ({ role, content }));
}

const BROWSE_HISTORY = messages(
  ['user', 'Show me opportunities'],
  [
    'assistant',
    'Here are three: [Beach cleanup](/en/opportunities/beach-cleanup), [Tree planting](https://basmatak.example/ar/opportunities/tree-planting), and [Remote tutoring](/opportunities/remote-tutoring).',
  ],
);

describe('recent entity extraction', () => {
  it('reads relative, absolute, and locale-agnostic public links newest first', () => {
    const recent = deriveRecentEntities(
      messages(
        ['user', 'Show me opportunities'],
        [
          'assistant',
          'Old: [Beach cleanup](/en/opportunities/beach-cleanup), [Nour](https://basmatak.example/ar/orgs/nour-association).',
        ],
        ['user', 'More'],
        [
          'assistant',
          'New: [Tree planting](/opportunities/tree-planting), [Remote tutoring](/ar/opportunities/remote-tutoring), [Second org](/organizations/second-org).',
        ],
      ),
    );

    expect(recent?.opportunities.map((item) => item.slug)).toEqual([
      'tree-planting',
      'remote-tutoring',
      'beach-cleanup',
    ]);
    expect(recent?.organizations.map((item) => item.slug)).toEqual([
      'second-org',
      'nour-association',
    ]);
  });

  it('caps each entity kind at the three most recent links', () => {
    const recent = deriveRecentEntities(
      messages(
        ['user', 'Show me opportunities'],
        [
          'assistant',
          '[One](/en/opportunities/one), [Two](/en/opportunities/two), [Three](/en/opportunities/three), [Four](/en/opportunities/four).',
        ],
      ),
    );

    expect(recent?.opportunities.map((item) => item.slug)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('ignores unsafe or unrelated links and keeps bounded public titles', () => {
    const recent = deriveRecentEntities(
      messages(
        ['user', 'hello'],
        [
          'assistant',
          '[Bad](/en/opportunities/a%2Fb), [Up](/en/opportunities/%2E%2E), [Script](javascript:alert(1)), [Home](https://example.org/), [Good](/en/opportunities/good).',
        ],
      ),
    );

    expect(recent?.opportunities.map((item) => item.slug)).toEqual(['good']);
  });

  it('recognizes an English and Arabic pending confirmation', () => {
    const english = deriveRecentEntities(
      messages(
        ['user', 'Do you know Nour association?'],
        ['assistant', 'Did you mean [Nour](/en/orgs/nour-association)?'],
      ),
      'yes',
    );
    expect(english?.pendingConfirmation).toMatchObject({
      kind: 'organization',
      slug: 'nour-association',
      title: 'Nour',
    });
    expect(english?.resolvedReference).toMatchObject({
      kind: 'yes_no',
      entities: [{ slug: 'nour-association' }],
    });

    const arabic = deriveRecentEntities(
      messages(
        ['user', 'تعرف جمعية نور؟'],
        ['assistant', 'هل تقصد [Nour](/ar/orgs/nour-association)؟'],
      ),
      'نعم',
    );
    expect(arabic?.pendingConfirmation?.slug).toBe('nour-association');
    expect(arabic?.resolvedReference?.kind).toBe('yes_no');
  });

  it('resolves first, second, and last ordinals against shown opportunities', () => {
    const first = deriveRecentEntities(
      BROWSE_HISTORY,
      'Tell me about the first one',
    );
    expect(first?.resolvedReference?.entities.map((item) => item.slug)).toEqual(
      ['beach-cleanup'],
    );

    const second = deriveRecentEntities(BROWSE_HISTORY, 'أخبرني عن الثانية');
    expect(
      second?.resolvedReference?.entities.map((item) => item.slug),
    ).toEqual(['tree-planting']);

    const last = deriveRecentEntities(BROWSE_HISTORY, 'the last one');
    expect(last?.resolvedReference?.entities.map((item) => item.slug)).toEqual([
      'remote-tutoring',
    ]);
  });

  it('resolves a pronoun to the pending confirmation or the newest entity', () => {
    const plain = deriveRecentEntities(
      BROWSE_HISTORY,
      'give me a summary about it',
    );
    expect(plain?.resolvedReference).toMatchObject({
      kind: 'pronoun',
      entities: [{ slug: 'beach-cleanup' }],
    });

    const pending = deriveRecentEntities(
      messages(
        ['user', 'Any Nour?'],
        ['assistant', 'Did you mean [Nour](/en/orgs/nour-association)?'],
      ),
      'tell me about it',
    );
    expect(pending?.resolvedReference).toMatchObject({
      kind: 'pronoun',
      entities: [{ slug: 'nour-association' }],
    });
  });

  it('prefers an exact raw slug from the message', () => {
    const recent = deriveRecentEntities(
      BROWSE_HISTORY,
      'show me remote-tutoring details',
    );

    expect(recent?.resolvedReference).toMatchObject({
      kind: 'slug',
      entities: [{ slug: 'remote-tutoring' }],
    });
  });

  it('formats only compact titles, slugs, pending, and resolved state', () => {
    const recent = deriveRecentEntities(
      messages(
        ['user', 'Any Nour?'],
        ['assistant', 'Did you mean [Nour](/en/orgs/nour-association)?'],
      ),
      'yes',
    );

    const text = formatRecentEntities(recent!);
    expect(text).toContain('pending: organization "Nour" (nour-association)');
    expect(text).toContain(
      'resolved (yes_no): organization "Nour" (nour-association)',
    );
    expect(text).toContain('opportunities: none');
    expect(text).toContain('organizations: "Nour" (nour-association)');
    // No free prose is carried into the model-first prompt.
    expect(text).not.toContain('Any Nour?');
    expect(text).not.toContain('Did you mean');
    expect(text).not.toContain('Last user question');
    expect(text).not.toContain('Last answer');
  });

  it('returns undefined only for empty history', () => {
    expect(deriveRecentEntities([], 'hello')).toBeUndefined();
    expect(deriveRecentEntities(undefined, 'hello')).toBeUndefined();
  });

  it('keeps the last question and answer even without linked entities', () => {
    const recent = deriveRecentEntities(
      messages(['user', 'hello'], ['assistant', 'Hi!']),
      'hello',
    );

    expect(recent).toMatchObject({
      opportunities: [],
      organizations: [],
      lastUserQuestion: 'hello',
      lastAnswerOffer: 'Hi!',
    });
    expect(recent?.pendingConfirmation).toBeUndefined();
    expect(recent?.resolvedReference).toBeUndefined();
  });

  it('leaves an unresolved ambiguous message unresolved', () => {
    expect(
      resolveRecentReference('tell me something unrelated', {
        opportunities: [],
        organizations: [],
      }),
    ).toBeUndefined();
  });
});
