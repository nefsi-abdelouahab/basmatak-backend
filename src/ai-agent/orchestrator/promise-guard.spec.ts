import { containsUnbackedPromise } from './promise-guard';

describe('promise guard', () => {
  it.each([
    'سأتحقق من معلومات جمعية نور لك.',
    'سأبحث عن ذلك الآن.',
    'وسأتحقق من الأمر.',
    'سوف أتحقق من المعلومة.',
    'دعني أتحقق من الأمر.',
    'اسمح لي بالتحقق من ذلك.',
    'لحظة من فضلك.',
    "I'll check and get back to you.",
    'I will verify that for you.',
    'Let me look that up.',
    "I'm going to search for it.",
    'Just a moment, please.',
  ])('detects an unbacked promise in %s', (text) => {
    expect(containsUnbackedPromise(text)).toBe(true);
  });

  it.each([
    '',
    'يمكنك التحقق من صفحة الفرص.',
    'المنظمة تراجع الأدلة وتتحقق من المساهمة.',
    'لا أملك معلومات مؤكدة عن هذا.',
    'The organization reviews the evidence and verifies the contribution.',
    'I checked the platform and found no confirmed information.',
    'You can browse opportunities on the platform.',
  ])('does not flag ordinary answer text: %s', (text) => {
    expect(containsUnbackedPromise(text)).toBe(false);
  });
});
