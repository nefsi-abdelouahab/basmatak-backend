import { AI_AGENT_SYSTEM_PROMPT } from '../prompt/system-prompt';
import { containsSystemInstructionLeak } from './answer-policy';

describe('answer-policy system-instruction leak guard (S12)', () => {
  it('flags a verbatim echo of the system rules', () => {
    expect(containsSystemInstructionLeak(AI_AGENT_SYSTEM_PROMPT)).toBe(true);
  });

  it('ignores case, punctuation, and markdown formatting', () => {
    const echo = `**${AI_AGENT_SYSTEM_PROMPT.replace(/[.,]/g, '')}**`;
    expect(containsSystemInstructionLeak(echo)).toBe(true);
  });

  it('does not flag normal grounded answers', () => {
    const answers = [
      'Basmatak connects volunteers with organizations [K1].',
      'You can browse opportunities and organizations to find a match [K1].',
      'I can only answer from Basmatak public information [K1].',
      'Volunteer safety guidance is covered in the public policies [K1].',
      '',
    ];
    for (const answer of answers) {
      expect(containsSystemInstructionLeak(answer)).toBe(false);
    }
  });

  it('does not flag a single short overlapping phrase', () => {
    expect(
      containsSystemInstructionLeak('Reply in the language you prefer today.'),
    ).toBe(false);
  });

  it('is safe for non-string input', () => {
    expect(containsSystemInstructionLeak(undefined as unknown as string)).toBe(
      false,
    );
  });
});
