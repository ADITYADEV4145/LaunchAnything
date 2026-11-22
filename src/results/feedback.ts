import { type Comment, type ObservedPost } from './metrics.js';
import { link, markdown } from './report.js';

type Kind = 'question' | 'objection' | 'bug' | 'request' | 'review';
interface Source extends Comment { channel: string; postId: string }
export interface Topic { kind: Kind; text: string; sources: Source[] }

const question = /\?|^(how|what|why|where|when|which|who|is there|does it)\b/i;
const request = /\b(feature request|please (add|support|allow|include|enable)|wish|would love|would be (nice|great|helpful)|(?:can|could|would) you (?:add|support|allow|include|enable|export|show)|needs? (?:an?|the) option)\b/i;
const bug = /\b(bug|crash\w*|exception|broken|fails?|failed|hangs?|freezes?|error(?:s| message)?|doesn.t work|not working)\b/i;
const objection = /\b(concern\w*|worr\w+|skeptic\w*|dealbreaker|too expensive|too slow|not convinced|don.t trust|won.t use|wouldn.t use|not comfortable|privacy risk|security risk|unclear)\b/i;
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function kinds(text: string): Kind[] {
  const result: Kind[] = [];
  if (question.test(text)) result.push('question');
  if (request.test(text)) result.push('request');
  if (objection.test(text)) result.push('objection');
  if (bug.test(text) && (!question.test(text) || /\b(i |we |it |this |the .* )(?:crash\w*|fail\w*|hang\w*|freez\w*|throw\w*)\b/i.test(text)))
    result.push('bug');
  return result.length ? result : ['review'];
}

export function mineFeedback(posts: ObservedPost[]) {
  const groups = new Map<string, Topic>();
  for (const post of posts) {
    for (const comment of post.comments ?? []) {
      const source = { ...comment, channel: post.channel, postId: post.id };
      const clauses = comment.body.trim().split(/(?<=[.!?])\s+(?=[\p{L}\p{N}])|\r?\n+/u);
      for (const clause of clauses) {
        for (const kind of kinds(clause)) {
          const key = JSON.stringify([kind, normalize(clause)]);
          const topic = groups.get(key) ?? { kind, text: clause, sources: [] };
          if (!topic.sources.some(s => s.channel === source.channel && s.postId === source.postId && s.id === source.id))
            topic.sources.push(source);
          groups.set(key, topic);
        }
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.sources.length - a.sources.length || a.text.localeCompare(b.text));
}

const sourceRefs = ({ sources }: Topic) => sources.map(s =>
  `${s.channel} / post ${markdown(s.postId, 200)} / comment ${markdown(s.id, 200)}${link(s.url)}`).join('; ');
const evidence = (topic: Topic) => markdown(topic.text, 800);

export function feedbackDrafts(topics: Topic[], brief: string | undefined) {
  const faq = topics.filter(t => t.kind === 'question');
  const requests = topics.filter(t => t.kind === 'request' || t.kind === 'bug');
  const ambiguities = topics.filter(t => t.kind === 'review');
  const objections = topics.filter(t => t.kind === 'objection' && !normalize(brief ?? '').includes(normalize(t.text)));
  const faqMarkdown = ['# FAQ additions — draft for site and README', '',
    'Confirm answers against the product before publishing. No answer has been assumed.', '',
    ...faq.flatMap(t => [`## ${evidence(t)}`, '', 'Answer: [Add a verified answer.]', '', `Source: ${sourceRefs(t)}`, '']),
    ...(!faq.length ? ['No questions classified.'] : []), ''].join('\n');
  const issues = requests.map(t => ({ title: markdown(t.text, 160), labels: ['from-launch'],
    kind: t.kind, draft: true, body: [
      `Reported ${t.kind === 'bug' ? 'bug' : 'feature request'}: ${evidence(t)}`, '',
      `Sources: ${sourceRefs(t)}`, '',
      t.kind === 'bug' ? 'Triage: Confirm reproduction, expected behavior, and affected version.' :
        'Triage: Confirm use case and acceptance criteria before filing.',
    ].join('\n') }));
  const notes = ['# Exemplar notes — candidate objections to address', '',
    brief === undefined ? 'No brief supplied; check whether these are already addressed.' :
      'Exact matches in the brief are omitted. Confirm whether the remaining objections are already addressed in other words.', '',
    ...objections.map(t => `- ${evidence(t)} — ${sourceRefs(t)}`),
    ...(!objections.length ? ['No candidate objection recorded.'] : []), '',
    '## Other comments to review', '',
    ...ambiguities.map(t => `- ${evidence(t)} — ${sourceRefs(t)}`),
    ...(!ambiguities.length ? ['None.'] : []), ''].join('\n');
  return { faqMarkdown, issues, notes, counts: { faq: faq.length, issues: issues.length, objections: objections.length } };
}
