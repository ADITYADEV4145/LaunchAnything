import { words, lengths, formality, type Voice } from './learn.js';

export function scoreVoice(text: string, voice: Voice, channel = 'general') {
  const clean = text.replace(/\[claim:[^\]]+\]/g, '');
  const tokens = words(clean), lens = lengths(clean);
  const overlap = tokens.filter(w => voice.wordsUsed.includes(w)).length / Math.max(1, tokens.length);
  const lengthFit = lens.filter(n => n >= voice.sentenceLength[0] * .6 && n <= voice.sentenceLength[1] * 1.5).length / Math.max(1, lens.length);
  const formalityFit = Math.max(0, 1 - Math.abs(formality(clean) - voice.formality) * 5);
  const score = Math.round(45 * overlap + 35 * lengthFit + 20 * formalityFit);
  const references = [...voice.samples].sort((a, b) => {
    const affinity = (sample: typeof a) => (sample.channel === channel ? 2 : 0) + words(sample.text).filter(w => tokens.includes(w)).length / Math.max(1, words(sample.text).length);
    return affinity(b) - affinity(a);
  }).slice(0, 3);
  return { score, threshold: voice.threshold, passed: tokens.length > 0 && score >= voice.threshold,
    components: { vocabularyOverlap: overlap, sentenceLengthFit: lengthFit, formalityFit },
    rewrite: score < voice.threshold || !tokens.length ? { instruction: 'Agent: rewrite using these owned samples. Preserve supported facts and citations; do not invent claims. CLI does not call an LLM.', references } : undefined };
}
