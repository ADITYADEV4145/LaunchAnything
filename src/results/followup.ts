import { nonempty, record, type Results } from './metrics.js';
import type { Topic } from './feedback.js';
import { link, markdown } from './report.js';

const draft = (heading: string, ...body: string[]) =>
  [`# ${heading} — draft for approval`, '', 'Local draft only; nothing has been sent or scheduled.', '', ...body, ''].join('\n');

export function shippedFix(raw: unknown) {
  if (raw === undefined) return undefined;
  const { channel, postId, commentId, title, releaseUrl } = record(raw);
  if (!nonempty(channel) || !nonempty(postId) || !nonempty(commentId) || !nonempty(title) ||
    !nonempty(releaseUrl) || !link(releaseUrl) || new URL(releaseUrl).protocol !== 'https:')
    throw new Error('shippedFix requires channel, postId, commentId, title and a public HTTPS releaseUrl');
  return { channel, postId, commentId, title, releaseUrl };
}

const measured = (row: Results['channels'][number]) =>
  (['views', 'clicks', 'comments', 'signups', 'waitlistConversions'] as const).flatMap(name => row[name] === undefined ? [] :
    [`${row[name]} ${name === 'waitlistConversions' ? 'waitlist conversions' : name}`]).join(', ');

export function followupDrafts(results: Results, day: number, topics: Topic[], fix: ReturnType<typeof shippedFix>) {
  const rows = results.channels.flatMap(row => measured(row) ? [`- ${row.channel}: ${measured(row)}`] : []);
  const posts = day === 1 ? [{ filename: 't-plus-1-thank-you.md', body: draft('T+1 thank-you post', ...(rows.length ? [
    'Thanks for trying the launch and telling us what works and what doesn’t. Here’s what we recorded at the first checkpoint:', '',
    ...rows, '', 'What would make it more useful for you?',
  ] : ['Not ready: supply measured T+1 counts before sharing a thank-you with numbers.'])) }] : [];
  if (day === 3) {
    const channels = results.channels.filter(row => row.channel === 'show-hn' || row.channel === 'product-hunt');
    const observations = channels.flatMap(row => measured(row) ? [`- ${row.channel === 'show-hn' ? 'Show HN' : 'Product Hunt'}: ${measured(row)}`] : []);
    const questions = topics.filter(t => t.kind === 'question' && t.sources.some(s => ['show-hn', 'product-hunt'].includes(s.channel)));
    posts.push({ filename: 't-plus-3-lessons.md', body: draft('T+3 what we learned', ...(observations.length ? [
      'Here’s what we measured from the launch:', '', ...observations, '',
      ...questions.slice(0, 3).map(t => `- A reader asked: “${markdown(t.text)}”`), '',
      'These are observed counts and comments. They don’t tell us why a channel performed the way it did.',
    ] : ['Not ready: supply measured T+3 Show HN or Product Hunt data before sharing observations.'])) });
  }
  if (day === 7) {
    const top = topics.find(t => t.kind === 'request' || t.kind === 'bug');
    const matches = fix && top?.sources.some(s => s.channel === fix.channel && s.postId === fix.postId && s.id === fix.commentId);
    posts.push({ filename: 't-plus-7-email.md', body: draft('T+7 signup and waitlist email',
      'Audience: new signups and waitlist members who opted in. Verify consent and include an unsubscribe link.', '',
      ...(matches ? [`Subject: We shipped ${markdown(fix.title, 120)}`, '',
        `Thanks for your feedback. You asked about “${markdown(top!.text)}”. We’ve shipped ${markdown(fix.title)}${link(fix.releaseUrl)}.`, '',
        'If you try it, let us know what still gets in your way.', '',
        'Review the released change and link before approving this draft.'] :
        ['Not ready: confirm a shipped fix for the top recorded issue or request, with a release link, before drafting an announcement.'])) });
  }
  return posts;
}
