import { parse } from 'yaml';
import { resolve } from 'node:path';
import type { ReviewPost } from '../review/posts.js';
import type { BrowserDriver } from './browser.js';
import { productHuntPayload } from './payloads.js';

export const forms = {
  'show-hn': { url: 'https://news.ycombinator.com/submit', result: /^https:\/\/news\.ycombinator\.com\/item\?id=\d+/ },
  reddit: { url: 'https://www.reddit.com/submit', result: /^https:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\// },
  'product-hunt': { url: 'https://www.producthunt.com/posts/new', result: /^https:\/\/www\.producthunt\.com\/posts\/(?!new(?:$|[/?#]))[^/?#]+/ },
};
export type BrowserPlatform = keyof typeof forms;
export function frontMatter(post: ReviewPost): Record<string, unknown> {
  return parse(/^---\s*\n([\s\S]*?)\n---/.exec(post.source)?.[1] ?? '') ?? {};
}
export async function fillForm(driver: BrowserDriver, post: ReviewPost, root: string) {
  const channel = post.channel as BrowserPlatform;
  const extra = frontMatter(post);
  const media = post.media.map(m => resolve(root, m.path.replace(/^\.launch\//, '')));
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
      video: media.find(p => /\.(mp4|webm|mov)$/i.test(p)), makerComment: String(extra.makerComment ?? post.body), date: post.scheduledAt.slice(0, 10) });
    for (const [name, value] of Object.entries({ name: payload.name, tagline: payload.tagline, description: payload.description,
      makerComment: payload.makerComment, launchAt: payload.launchAt, timezone: payload.timezone }))
      await driver.fill(`[name="${name}"]`, value);
    if (payload.gallery.length) await driver.upload('input[name="gallery"]', payload.gallery);
    if (payload.video) await driver.upload('input[name="video"]', [payload.video]);
  }
}
