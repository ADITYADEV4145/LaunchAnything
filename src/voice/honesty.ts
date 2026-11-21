import type { Product } from '../copy/context.js';

export function honesty(text: string, product: Product, disclosure: boolean, account?: string, ownAccount?: string) {
  const issues: { rule: string; message: string }[] = [];
  const add = (id: string, message: string) => issues.push({ rule: 'honesty.' + id, message });
  if (account && (!ownAccount || account !== ownAccount)) add('account', 'Posting account must match the user-owned account in config.accounts.');
  if (/\bas (?:a|an) (?:happy |paying )?(?:customer|user)\b|\bi (?:bought|purchased) this\b/i.test(text)) add('posing-as-customer', 'Do not pose as a customer of your own product.');
  if (disclosure && !/\bI (?:built|made|maintain|created|developed)|\b(?:our|my) (?:project|product|app|tool)|\b(?:founder|maker|author|affiliated)\b/i.test(text))
    add('affiliation', 'Disclose your affiliation; this is a conservative local community policy, not verified live policy.');
  const sentences = text.replace(/^[ \t]*(?:\d+[.)]|[-+*])[ \t]+/gm, '\n\n')
    .split(/\r?\n---\r?\n|\r?\n[ \t]*\r?\n/).flatMap(paragraph => paragraph
      .replace(/\r?\n/g, ' ')
      .replace(/([.!?])\s+((?:\[claim:[^\]]+\]\s*)+)/g, ' $2$1 ')
      .split(/(?<=[.!?])\s+/));
  for (const sentence of sentences) {
    const cited = [...sentence.matchAll(/\[claim:([^\]]+)\]/g)].map(m => m[1]);
    const supported = (value: string) => product.claims.some(c => cited.includes(c.id) && c.sources?.length && c.text.toLowerCase().includes(value.toLowerCase()));
    for (const match of sentence.matchAll(/\b(?:\d[\d,.]*\s*[kKmMbB]?|one|two|three|hundreds|thousands|millions)\s+(?:(?:active|happy|paying|registered|daily|monthly)\s+)*(?:users?|customers?|downloads?)\b/gi)) {
      if (!supported(match[0])) add('unsupported-count', 'Audience count is not backed by a cited sourced claim: ' + match[0]);
    }
    for (const quote of sentence.matchAll(/["“]([^"”]{8,})["”]/g)) {
      if (/\b(?:love|amazing|best|saved|excellent|recommend|great)\b/i.test(quote[1]) && !supported(quote[1]))
        add('testimonial', 'Quoted praise needs a cited claim with a source containing the quotation.');
    }
    if (/\b(?:customers?|users?) (?:love|praise|recommend)|\btestimonial\b/i.test(sentence) && !product.claims.some(c => cited.includes(c.id) && c.sources?.length && sentence.includes(c.text)))
      add('testimonial', 'Do not invent testimonials or customer endorsements.');
  }
  return issues;
}
