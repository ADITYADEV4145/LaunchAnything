import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { validateFile } from '../core/schema.js';
import { context, type Product } from './context.js';
import { loadPlatform } from './platforms.js';
import { assertSafePath } from './safe-path.js';

export interface Post {
  channel: string; title: string; body: string; media: {slot: string; path?: string; width?: number; height?: number}[];
  claims: string[]; link?: string; linkFirstComment?: boolean; subreddit?: string; flair?: string; selfPromotion?: boolean;
}
const extensionValidator = new Ajv2020({ allErrors: true }).compile({
  type: 'object', additionalProperties: false, properties: {
    linkFirstComment: { type: 'boolean' }, subreddit: { type: 'string', pattern: '^r/[A-Za-z0-9_]+$' },
    flair: { type: 'string', minLength: 1, pattern: '\\S' }, selfPromotion: { type: 'boolean' },
    media: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['slot'], properties: {
      slot: { type: 'string', minLength: 1 }, path: { type: 'string', minLength: 1 },
      width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }
    } } }
  }
});
export interface Issue { channel: string; rule: string; message: string; fix: string }
export const stripCitations = (text: string) => text.replace(/\[claim:[^\]]+\]/g, '').trim();
export function parsePost(text: string): Post {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('Expected YAML front matter followed by Markdown');
  const metadata: unknown = parse(match[1]);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Front matter must be an object');
  const post = { ...metadata, body: match[2].trim() };
  const { linkFirstComment, subreddit, flair, selfPromotion, media, ...base } = post as Post;
  const extensions = { linkFirstComment, subreddit, flair, selfPromotion, media };
  if (!extensionValidator(extensions)) throw new Error('Invalid phase 2 metadata: ' + JSON.stringify(extensionValidator.errors));
  const result = validateFile('post', { ...base, media: media?.map(({ width, height, ...item }) => item) });
  if (!result.valid) throw new Error(result.errors.join('; '));
  return post as Post;
}
export function similarity(a: string, b: string) {
  const shingles = (text: string) => {
    const words = stripCitations(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return new Set(words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' ')));
  };
  const x = shingles(a), y = shingles(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter(s => y.has(s)).length / new Set([...x, ...y]).size;
}
export function inspectPost(post: Post, channel: string, product: Product): Issue[] {
  const rules = loadPlatform(channel), issues: Issue[] = [];
  const add = (rule: string, message: string, fix: string) => issues.push({ channel, rule, message, fix });
  const title = stripCitations(post.title), body = stripCitations(post.body);
  if (post.channel !== channel) add('post.channel', 'Channel does not match filename', 'Set channel to ' + channel);
  if (rules.title.required && !title) add('title.required', 'Title is empty', 'Supply a factual title');
  if (title.length > rules.title.maxLength) add('title.length', 'Title exceeds ' + rules.title.maxLength, 'Shorten the title');
  if (rules.title.prefix && !title.startsWith(rules.title.prefix)) add('title.prefix', 'Missing ' + rules.title.prefix, 'Use the required prefix');
  if (rules.taglineMax && title.length > rules.taglineMax) add('tagline.length', 'Tagline too long', 'Shorten to ' + rules.taglineMax + ' characters');
  if (rules.subjectMax && title.length > rules.subjectMax) add('subject.length', 'Subject too long', 'Shorten to ' + rules.subjectMax + ' characters');
  if (rules.captionMax && body.length > rules.captionMax) add('caption.length', 'Caption too long', 'Shorten to ' + rules.captionMax + ' characters');
  if (rules.makerComment?.required) {
    const lines = post.body.split(/\r?\n/);
    const index = lines.findIndex(line => line.trim() === rules.makerComment!.heading);
    const section = index < 0 ? '' : lines.slice(index + 1).join('\n').split(/^## /m)[0].trim();
    if (!stripCitations(section)) add('maker-comment.required', 'Missing maker comment section', 'Add ' + rules.makerComment.heading + ' followed by a substantive comment');
  }
  if (rules.gallery) {
    const gallery = post.media.filter(item => item.slot.startsWith('gallery-'));
    if (gallery.length && gallery.length < rules.gallery.minImages) add('gallery.count', 'Too few supplied gallery images', 'Supply at least ' + rules.gallery.minImages + ' images, or omit unsupplied assets');
    if (gallery.some(item => item.width !== rules.gallery!.width || item.height !== rules.gallery!.height))
      add('gallery.size', 'Gallery dimensions missing or outside budget', 'Declare width ' + rules.gallery.width + ' and height ' + rules.gallery.height + ' for each gallery image; manually verify files');
  }
  if (post.linkFirstComment && !rules.linkFirstComment) add('links.placement', 'First-comment links unsupported here', 'Remove linkFirstComment for this channel');
  if (post.linkFirstComment && rules.linkFirstComment) {
    if (!post.link) add('links.comment-required', 'First-comment link missing', 'Set front matter link to the URL for the first comment');
    if (/https?:\/\//i.test(body)) add('links.first-comment', 'Link remains in body', 'Move body URLs to front matter link for the first comment');
  }
  if (rules.subreddits) {
    const entry = Object.entries(rules.subreddits).find(([name]) => name.toLowerCase() === post.subreddit?.toLowerCase())?.[1];
    if (!entry) add('reddit.subreddit', 'Missing or unsupported subreddit', 'Name a configured subreddit in front matter and review its current rules');
    else {
      if (entry.flairRequired && !post.flair?.trim()) add('reddit.flair-required', 'Target requires flair under local policy', 'Set a valid flair from the target community');
      if (entry.selfPromotion === 'forbidden' && post.selfPromotion !== false) add('reddit.self-promotion', 'Self-promotion forbidden under local policy', 'Choose another community; selfPromotion defaults to true for launch posts');
    }
  }
  if (body.length < rules.body.minLength || body.length > rules.body.maxLength) add('body.length', 'Body outside platform length budget', 'Use ' + rules.body.minLength + '–' + rules.body.maxLength + ' characters');
  if (rules.postMax) {
    const posts = body.split(/\r?\n---\r?\n/);
    if (posts.some(p => p.trim().length > rules.postMax!)) add('thread.post-length', 'Thread post too long', 'Keep each post within ' + rules.postMax + ' characters');
    if (posts.length > rules.threadMax!) add('thread.length', 'Too many thread posts', 'Reduce thread to ' + rules.threadMax);
  }
  if (rules.hookMax && body.split(/\n\s*\n/)[0].length > rules.hookMax) add('hook.length', 'Opening hook too long', 'Keep first paragraph within ' + rules.hookMax + ' characters');
  const text = title + '\n' + body;
  for (const word of rules.bannedWords) {
    if (text.toLowerCase().includes(word.toLowerCase())) add('words.banned', 'Banned phrase: ' + word, 'Replace hype with concrete evidence');
  }
  const urls = new Set((text + '\n' + (post.link ?? '')).match(/https?:\/\/[^\s<>)\]]+/g) ?? []);
  if (urls.size > rules.maxLinks) add('links.count', 'Too many links', 'Use at most ' + rules.maxLinks + ' distinct links');
  if (rules.requiredLink && !post.link) add('links.required', 'A tryable product link is required', 'Set front matter link to a working demo or runnable repository');
  const known = new Set(product.claims.map(c => c.id));
  const cited = [...(post.title + '\n' + post.body).matchAll(/\[claim:([^\]]+)\]/g)].map(m => m[1]);
  if ([...post.claims, ...cited].some(id => !known.has(id))) add('claims.unknown', 'Unknown claim ID', 'Use IDs from product.json');
  if (cited.some(id => !post.claims.includes(id))) add('claims.undeclared', 'Citation missing from front matter', 'Declare cited IDs in claims');
  const sentences = (post.title + '\n' + post.body).split(/(?<=[.!?])\s+|\n/).filter(Boolean);
  if (sentences.some(sentence => {
    const clean = stripCitations(sentence).replace(/https?:\/\/\S+/g, '');
    return (/\d/.test(clean) || product.features.some(f => clean.toLowerCase().includes(f.name.toLowerCase())))
      && !/\[claim:[^\]]+\]/.test(sentence);
  })) add('claims.uncited', 'A number or feature sentence lacks a citation', 'Attach a supported [claim:id] to each factual sentence');
  return issues;
}
export function checkPosts(cwd: string, selected?: string[]) {
  const ctx = context(cwd, selected), issues: Issue[] = [], posts: Post[] = [];
  assertSafePath(cwd, join(ctx.paths.posts, 'check-state.json'));
  assertSafePath(cwd, join(ctx.paths.posts, 'fix-list.md'));
  for (const channel of ctx.channels) {
    const path = join(ctx.paths.posts, channel + '.md');
    if (!existsSync(path)) { issues.push({ channel, rule: 'post.missing', message: 'Missing planned post', fix: 'Write ' + path }); continue; }
    try {
      const post = parsePost(readFileSync(path, 'utf8'));
      issues.push(...inspectPost(post, channel, ctx.product));
      posts.push({ ...post, channel });
    } catch (error) { issues.push({ channel, rule: 'post.schema', message: String(error), fix: 'Follow the brief front matter format' }); }
  }
  for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) {
    if (similarity(posts[i].body, posts[j].body) > 0.6) {
      for (const post of [posts[i], posts[j]]) issues.push({ channel: post.channel, rule: 'text.duplicate', message: 'Over 60% similarity with another channel', fix: 'Rewrite natively for this audience' });
    }
  }
  mkdirSync(ctx.paths.posts, { recursive: true });
  const statePath = join(ctx.paths.posts, 'check-state.json');
  let attempts = 0;
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!Number.isInteger(state.attempts) || state.attempts < 0) throw new Error('Invalid check-state attempts');
    attempts = state.attempts;
  }
  attempts = issues.length ? attempts + 1 : 0;
  writeFileSync(statePath, JSON.stringify({ attempts }, null, 2) + '\n');
  const fixPath = join(ctx.paths.posts, 'fix-list.md');
  if (issues.length) writeFileSync(fixPath, '# Fix list\n\n' + issues.map(i => '## ' + i.channel + ' — ' + i.rule + '\n' + i.message + '\n\nSuggested fix: ' + i.fix).join('\n\n') + (attempts >= 3 ? '\n\nSTOP: Three failed loops reached. Ask the user before rewriting again.\n' : '\n'));
  else rmSync(fixPath, { force: true });
  return { passed: !issues.length, issues, attempts, askUser: attempts >= 3 };
}
