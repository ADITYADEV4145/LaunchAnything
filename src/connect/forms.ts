import { parse } from 'yaml';
import { dirname, extname, join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ReviewPost } from '../review/posts.js';
import type { BrowserDriver } from './browser.js';
import { productHuntDate, productHuntPayload } from './payloads.js';
import { builtinSiteMetadata, site } from '../core/registry.js';

export type BrowserPlatform = 'show-hn' | 'reddit' | 'product-hunt';
export const forms = Object.fromEntries(Object.entries(builtinSiteMetadata())
  .filter(([, site]) => site.assisted?.browserResult)
  .map(([id, site]) => [id, { url: site.submitUrl!, result: new RegExp(site.assisted!.browserResult!) }])) as Record<BrowserPlatform, { url: string; result: RegExp }>;
export function frontMatter(post: ReviewPost): Record<string, unknown> {
  return parse(/^---\s*\n([\s\S]*?)\n---/.exec(post.source)?.[1] ?? '') ?? {};
}
export async function fillForm(driver: BrowserDriver, post: ReviewPost, root: string) {
  const target = site(post.channel, dirname(root));
  if (target.custom || !target.assisted?.routes.includes('browser') || !Object.hasOwn(forms, post.channel))
    throw new Error(post.channel + ': no built-in browser form available');
  const staging = await mkdtemp(join(tmpdir(), 'liftoff-upload-'));
  const cleanup = () => rm(staging, { recursive: true, force: true });
  try {
    const media: string[] = [];
    for (const [index, item] of post.media.entries()) {
      const path = join(staging, `${index}${extname(item.path)}`);
      await writeFile(path, item.bytes, { mode: 0o600 });
      media.push(path);
    }
    await fillStagedForm(driver, post, media);
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}
async function fillStagedForm(driver: BrowserDriver, post: ReviewPost, media: string[]) {
  const channel = post.channel as BrowserPlatform;
  const extra = frontMatter(post);
  await driver.open(forms[channel].url);
  if (channel === 'show-hn') {
    await driver.fill('input[name="title"]', post.title);
    if (post.link) await driver.fill('input[name="url"]', post.link);
    await driver.fill('textarea[name="text"]', post.body);
  } else if (channel === 'reddit') {
    if (!extra.subreddit) throw new Error('Reddit requires subreddit in front matter');
    await driver.fill('input[name="subreddit"]', String(extra.subreddit));
    await driver.fill('textarea[name="title"]', post.title);
    await driver.fill(post.link ? 'input[name="url"]' : 'textarea[name="text"]', post.link ?? post.body);
    if (extra.flair) await driver.select('select[name="flair"]', String(extra.flair));
    if (media.length) await driver.upload('input[type="file"]', media);
  } else {
    const payload = productHuntPayload({ name: String(extra.name ?? post.title), tagline: String(extra.tagline ?? post.title),
      description: post.body, gallery: media.filter(p => !/\.(mp4|webm|mov)$/i.test(p)),
      video: media.find(p => /\.(mp4|webm|mov)$/i.test(p)), makerComment: String(extra.makerComment ?? post.body), date: productHuntDate(post.scheduledAt) });
    for (const [name, value] of Object.entries({ name: payload.name, tagline: payload.tagline, description: payload.description,
      makerComment: payload.makerComment, launchAt: payload.launchAt, timezone: payload.timezone }))
      await driver.fill(`[name="${name}"]`, value);
    if (payload.gallery.length) await driver.upload('input[name="gallery"]', payload.gallery);
    if (payload.video) await driver.upload('input[name="video"]', [payload.video]);
  }
}
