import type { Product } from './context.js';
import type { Platform } from './platforms.js';
import { annotate, normalize, pains, proofs, splitSentences, type Citation } from './citations.js';

export interface DraftPost {
  channel: string; title: string; body: string; media: { slot: string }[]; link?: string; flair?: string;
  citations?: Citation[]; variants?: { title?: string[]; hook?: string[] }; picked?: 1 | 2;
}
type Add = (rule: string, message: string, fix: string) => void;

export const bannedOpener = /^(?:i(?:'ve| have)? (?:just )?built|introducing|(?:i'm |i am |we're |we are |so |really )?(?:excited|thrilled|proud|happy) to)\b/i;
const greeting = /^(?:(?:hi|hey|hello)(?: there)?,?\s*(?:hn|everyone|all|folks|friends|reddit|r\/\w+)?[,!.:]?\s*)/i;
const codeless = (text: string) => text.replace(/```[\s\S]*?```/g, '');
const listItem = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/;

/** Splits on ## headings outside code fences; fenced blocks stay in their section. */
export function sectionsOf(body: string) {
  const blocks: string[] = [];
  const restore = (text: string) => text.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
  const parts = body.replace(/```[\s\S]*?```/g, block => '\u0000' + (blocks.push(block) - 1) + '\u0000').split(/^(?=## )/m);
  const lead = parts[0].startsWith('## ') ? '' : restore(parts.shift()!).trim();
  return { lead, sections: new Map(parts.map(part => {
    const [heading, ...rest] = part.split(/\r?\n/);
    return [heading.trim(), restore(rest.join('\n')).trim()];
  })) };
}
export const threadPosts = (body: string) => body.split(/\r?\n---\r?\n/).map(p => p.trim()).filter(Boolean);
const wordCount = (text: string) => (codeless(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const proseSentences = (text: string) => splitSentences(text.split(/\r?\n/).filter(l => !listItem.test(l) && !/^\s*#/.test(l)).join('\n'));

/** The sentence a reader sees first: post 1 of a thread, otherwise the first prose sentence. */
export function openingSentence(body: string, channel: string) {
  const text = channel === 'x' ? threadPosts(body)[0] ?? '' : codeless(body);
  const first = text.split(/\r?\n/).filter(l => l.trim() && !/^\s*#/.test(l)).join('\n');
  return (splitSentences(first.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, ''))[0] ?? '').replace(greeting, '').trim();
}

function openerIssues(sentence: string, annotated: string, product: Product, add: Add, label = 'Opening') {
  if (!sentence) return add('opener.missing', label + ' sentence is empty', 'Open with the top pain or the strongest proof metric.');
  const visible = sentence.replace(/\s*\[claim:[^\]]+\]/g, '');
  if (bannedOpener.test(visible)) add('opener.banned', label + ' starts with a banned opener: ' + visible.split(/\s+/).slice(0, 3).join(' '),
    'Never open with "I built", "Introducing" or "Excited to"; open with the pain or the proof number.');
  const ids = [...annotated.matchAll(/\[claim:([^\]]+)\]/g)].map(m => m[1]);
  const grounded = ids.some(id => id.startsWith('pain:') || id.startsWith('proof:')) || (ids.length > 0 && /\d/.test(visible));
  if (!grounded) add('opener.grounded', label + ' is not tied to a pain or proof point',
    'Cite pain ' + (pains(product).length ? '1' : '(product.problem)') + ' or a proof metric (' + proofs(product).slice(0, 3).map(p => p.metric).join(', ') + ') on the first sentence.');
}

export function templateIssues(post: DraftPost, rules: Platform, product: Product, add: Add) {
  const t = rules.template;
  const body = post.body, title = post.title;
  const annotatedFirst = (text: string) => annotate(text, post.citations, product);
  const opener = openingSentence(body, post.channel);
  openerIssues(opener, openingSentence(annotatedFirst(body), post.channel), product, add);
  if (!t) return;
  const { lead, sections } = sectionsOf(body);
  if (t.titlePattern) {
    if (!new RegExp(t.titlePattern).test(title)) add('template.title', 'Title does not follow ' + (t.titleExample ?? t.titlePattern), 'Use the form: ' + t.titleExample);
    if (!title.toLowerCase().includes(product.name.toLowerCase())) add('template.title-name', 'Title does not name ' + product.name, 'Put the product name right after the prefix.');
  }
  if (t.sentences) {
    const count = proseSentences(codeless(post.channel === 'reddit' ? body : lead)).length;
    if (count < t.sentences.min || count > t.sentences.max) add('template.sentences', 'Description has ' + count + ' sentences',
      'Write ' + t.sentences.min + '–' + t.sentences.max + ' sentences: problem, what it does, proof, how it runs, link.');
  }
  if (t.words) {
    const count = wordCount(body);
    if (count < t.words.min || count > t.words.max) add('template.words', 'Article has ' + count + ' words', 'Write ' + t.words.min + '–' + t.words.max + ' words.');
  }
  if (t.thread) {
    const posts = threadPosts(body);
    if (posts.length < t.thread.min || posts.length > t.thread.max) add('template.thread', 'Thread has ' + posts.length + ' posts',
      'Write ' + t.thread.min + '–' + t.thread.max + ' posts separated by ---.');
    const last = posts.at(-1) ?? '';
    if (t.lastPostLink && !/https?:\/\/\S+/.test(last)) add('template.last-link', 'Last post has no link', 'Put the product link in the last post.');
    if (t.lastPostAsk && !last.includes('?')) add('template.last-ask', 'Last post does not ask for feedback', 'End with one specific question.');
  }
  if (t.firstPostMedia && !post.media.length) add('template.first-media', 'Post 1 has no media', 'Attach the money-moment screenshot or clip as the first media slot.');
  if (t.minMedia && post.media.length < t.minMedia) add('template.media', 'Needs at least ' + t.minMedia + ' image or a carousel', 'Add a media slot.');
  for (const section of t.sections ?? []) {
    const content = sections.get(section.heading);
    if (content === undefined || !content.trim()) { add('template.section', 'Missing section ' + section.heading, 'Add ' + section.heading + ' with content.'); continue; }
    const prose = codeless(content), words = wordCount(content), items = prose.split(/\r?\n/).filter(l => listItem.test(l)).length;
    if (section.minWords && words < section.minWords) add('template.section-short', section.heading + ' has ' + words + ' words', 'Write at least ' + section.minWords + ' words.');
    if (section.maxWords && words > section.maxWords) add('template.section-long', section.heading + ' has ' + words + ' words', 'Keep it under ' + (section.maxWords + 1) + ' words.');
    if (section.minItems && items < section.minItems) add('template.section-items', section.heading + ' has ' + items + ' list items', 'List at least ' + section.minItems + ' items.');
    if (section.ask && !prose.includes('?')) add('template.section-ask', section.heading + ' does not ask for feedback', 'Ask one specific question.');
  }
  for (const heading of t.headings ?? []) {
    if (!new RegExp(heading.pattern, 'im').test(codeless(body))) add('template.heading', 'Missing a section on ' + heading.label, 'Add a ## heading for ' + heading.label + '.');
  }
  if (t.codeBlock && !/```[\s\S]+?```/.test(body)) add('template.code', 'No code block', 'Show the command or code a reader would run.');
  if (t.flair && !post.flair?.trim()) add('template.flair', 'No flair set', 'Set flair from the subreddit\'s list.');
  if (t.disclosure && !/\bdisclosure\b|\b(?:I|we) (?:built|made|created|maintain|wrote)\b/i.test(body)) add('template.disclosure', 'No disclosure line', 'Add a line saying you made it.');
  if (t.paragraphMaxSentences) {
    const long = body.split(/\r?\n[ \t]*\r?\n/).filter(p => !/^\s*[#!]/.test(p) && splitSentences(p).length > t.paragraphMaxSentences!);
    if (long.length) add('template.paragraphs', long.length + ' paragraph(s) over ' + t.paragraphMaxSentences + ' sentences', 'Break paragraphs into one or two sentences.');
  }
  if (t.variants === 'title') {
    const variants = post.variants?.title;
    if (!variants || new Set(variants.map(normalize)).size !== 2) add('variants.missing', 'Needs two distinct title variants', 'Set variants.title to two options; the title is the picked one.');
    else {
      if (!variants.map(normalize).includes(normalize(title))) add('variants.title', 'Title is not one of the variants', 'Run liftoff pick or copy a variant into title.');
      variants.forEach((variant, i) => {
        if (rules.title.prefix && !variant.startsWith(rules.title.prefix)) add('variants.prefix', 'Variant ' + (i + 1) + ' lacks ' + rules.title.prefix, 'Use the required prefix.');
        const max = Math.min(rules.title.maxLength, rules.taglineMax ?? Infinity);
        if ([...variant].length > max) add('variants.length', 'Variant ' + (i + 1) + ' exceeds ' + max + ' characters', 'Shorten it.');
        if (t.titlePattern && !new RegExp(t.titlePattern).test(variant)) add('variants.pattern', 'Variant ' + (i + 1) + ' does not follow ' + t.titleExample, 'Use the title form.');
        if (bannedOpener.test(variant.replace(rules.title.prefix ?? '', ''))) add('variants.banned', 'Variant ' + (i + 1) + ' opens with a banned phrase', 'Lead with what it does.');
      });
    }
  }
  if (t.variants === 'hook') {
    const variants = post.variants?.hook, first = threadPosts(body)[0] ?? '';
    if (!variants || new Set(variants.map(normalize)).size !== 2) add('variants.missing', 'Needs two distinct variants of post 1', 'Set variants.hook to two options; post 1 is the picked one.');
    else {
      if (!variants.map(normalize).includes(normalize(first))) add('variants.hook', 'Post 1 is not one of the variants', 'Run liftoff pick or copy a variant into post 1.');
      variants.forEach((variant, i) => {
        if (rules.postMax && [...variant].length > rules.postMax) add('variants.length', 'Variant ' + (i + 1) + ' exceeds ' + rules.postMax + ' characters', 'Shorten it.');
        openerIssues(openingSentence(variant, 'x'), openingSentence(annotatedFirst(variant), 'x'), product,
          (rule, message, fix) => add(rule.replace('opener.', 'variants.opener-'), 'Variant ' + (i + 1) + ': ' + message, fix), 'Variant');
      });
    }
  }
}
