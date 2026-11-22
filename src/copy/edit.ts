import { existsSync, readFileSync } from 'node:fs';
import { assertSafePath, atomicWrite } from './safe-path.js';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { context } from './context.js';
import { parsePost } from './check.js';
import { stripInline, type Citation } from './citations.js';
import { threadPosts } from './template.js';

function split(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('Expected YAML front matter followed by Markdown');
  return { front: parse(match[1]) as Record<string, unknown>, body: match[2] };
}
const join2 = (front: Record<string, unknown>, body: string) => '---\n' + stringify(front, { lineWidth: 0 }).trimEnd() + '\n---\n' + body.trimStart();

/** Move inline [claim:id] tags into front-matter citations so the visible text stays clean. */
export function stripClaims(cwd: string, selected?: string[]) {
  const ctx = context(cwd, selected), changed: string[] = [];
  for (const channel of ctx.channels) {
    const path = join(ctx.paths.posts, channel + '.md');
    assertSafePath(cwd, path);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, 'utf8');
    if (!/\[claim:[^\]]+\]/.test(source)) continue;
    const { front, body } = split(source);
    const result = stripInline(String(front.title ?? ''), body);
    const known = new Map(((front.citations as Citation[] | undefined) ?? []).map(c => [JSON.stringify(c), c]));
    for (const c of result.citations) known.set(JSON.stringify(c), c);
    atomicWrite(cwd, path, join2({ ...front, title: result.title.trim(), citations: [...known.values()] }, result.body));
    parsePost(readFileSync(path, 'utf8'));
    changed.push(channel);
  }
  return { changed };
}

/** Make variant 1 or 2 the live title (Show HN, Product Hunt) or post 1 (X). */
export function pickVariant(cwd: string, channel: string, variant: number) {
  if (variant !== 1 && variant !== 2) throw new Error('Variant must be 1 or 2');
  const path = join(context(cwd, [channel]).paths.posts, channel + '.md');
  assertSafePath(cwd, path);
  const { front, body } = split(readFileSync(path, 'utf8'));
  const variants = front.variants as { title?: string[]; hook?: string[] } | undefined;
  let next = body;
  if (variants?.title?.length === 2) front.title = variants.title[variant - 1];
  else if (variants?.hook?.length === 2) {
    const posts = threadPosts(body);
    posts[0] = variants.hook[variant - 1];
    next = posts.join('\n---\n') + '\n';
  } else throw new Error(channel + ' has no variants to pick from');
  front.picked = variant;
  atomicWrite(cwd, path, join2(front, next));
  parsePost(readFileSync(path, 'utf8'));
  return { channel, picked: variant, title: front.title };
}
