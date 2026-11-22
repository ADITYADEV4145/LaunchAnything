import { fillForm, forms, type BrowserPlatform } from '../connect/forms.js';
import { chromeBrowser, MockBrowser, type BrowserDriver } from '../connect/browser.js';
import { osKeychain, type Keychain } from '../connect/keychain.js';
import type { Connection } from '../connect/registry.js';
import type { ReviewPost } from '../review/posts.js';
import type { PublishReceipt } from '../adapters/index.js';

export type GoRoute = 'browser' | 'postiz' | 'devto-api' | 'github-api' | 'official-mcp' | 'kit-mcp';
export function routeFor(channel: string): GoRoute {
  if (['show-hn', 'reddit'].includes(channel)) return 'browser';
  if (['product-hunt', 'x'].includes(channel)) return 'official-mcp';
  if (channel === 'devto') return 'devto-api';
  if (channel === 'github-release') return 'github-api';
  if (['email', 'kit'].includes(channel)) return 'kit-mcp';
  if (['linkedin', 'instagram', 'tiktok', 'youtube', 'threads', 'bluesky', 'reels', 'shorts'].includes(channel)) return 'postiz';
  throw new Error(channel + ': no one-go publishing route');
}
export interface DispatchContext {
  post: ReviewPost; connection: Connection; root: string;
  notify: (message: string) => void;
}
export interface GoAdapter { publish(context: DispatchContext): Promise<PublishReceipt> }
export function mcpUnavailableReason(channel: string) {
  return `${channel}: no verified official publish tool contract is available; publishing is disabled.` +
    (channel === 'product-hunt' ? ' Verified PH tools only create and preview drafts; they do not authorize final submission.' : ' Tool discovery alone does not authorize an unfamiliar write tool.');
}
export class McpPublishingUnavailable extends Error {
  constructor(channel: string) { super(mcpUnavailableReason(channel)); }
}
export class PublishRequestFailure extends Error {
  constructor(message: string, public retryable = false) { super(message); }
}
const unknownOutcome = 'Publication outcome is unknown; check the destination for an existing post before using the paste file. No automatic retry.';
export function mockAdapter(browser?: (channel: string) => BrowserDriver): GoAdapter {
  return { async publish({ post, root, notify }) {
    let url = `https://example.test/${post.channel}/${post.hash}`;
    if (routeFor(post.channel) === 'browser') {
      url = post.channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/123/mock/' : 'https://news.ycombinator.com/item?id=123';
      const driver = browser?.(post.channel) ?? new MockBrowser(url);
      const cleanup = await fillForm(driver, post, root);
      try { notify(post.channel + ': prefilled; founder must press Submit'); url = await driver.waitForUrl(forms[post.channel as BrowserPlatform].result, 600000); }
      finally { await driver.close(); await cleanup(); }
    }
    return { channel: post.channel, id: `go-mock:${post.hash}`, url, status: 'published', scheduledAt: post.scheduledAt };
  } };
}

export function liveAdapter(options: { keychain?: Keychain; request?: typeof fetch;
  browser?: (profile: string) => Promise<BrowserDriver> } = {}): GoAdapter {
  const request = options.request ?? fetch;
  return { async publish({ post, connection, root, notify }) {
    const route = routeFor(post.channel);
    if (route === 'browser') {
      const driver = await (options.browser ?? chromeBrowser)(connection.profile!);
      let cleanup: (() => Promise<void>) | undefined;
      try {
        cleanup = await fillForm(driver, post, root);
        notify(post.channel + ': prefilled; press Submit in your browser');
        const url = await driver.waitForUrl(forms[post.channel as BrowserPlatform].result, 600000);
        return { channel: post.channel, id: `go:${post.hash}`, url, status: 'published', scheduledAt: post.scheduledAt };
      } finally { await driver.close(); await cleanup?.(); }
    }
    if (route === 'official-mcp' || route === 'kit-mcp')
      throw new McpPublishingUnavailable(post.channel);
    const token = await (options.keychain ?? osKeychain()).get(`${connection.platform}:${connection.account}`);
    if (!token) throw new Error('Connected account token unavailable');
    if (post.media.length) throw new Error('Live media upload is not supported by this adapter; use the paste file with the approved attachments');
    const send = async (url: string, headers: Record<string, string>, body: unknown) => {
      let response: Response;
      try {
        response = await request(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (error) {
        const failure = error as { code?: string; cause?: { code?: string } };
        const safe = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(failure.cause?.code ?? failure.code ?? '');
        throw new PublishRequestFailure(safe ? 'Connection failed before the publish request reached the platform.' : unknownOutcome, safe);
      }
      if (!response.ok) throw new PublishRequestFailure(`Publish request failed (${response.status}). ${unknownOutcome}`);
      try { return await response.json(); }
      catch { throw new PublishRequestFailure(unknownOutcome); }
    };
    let result: any, url: unknown, id: unknown;
    if (route === 'devto-api') {
      result = await send('https://dev.to/api/articles', { 'api-key': token }, { article: {
        title: post.title, body_markdown: [post.body, post.link].filter(Boolean).join('\n\n'), published: true } });
      url = result.url; id = result.id;
    } else if (route === 'github-api') {
      if (!/^[\w.-]+\/[\w.-]+$/.test(connection.account)) throw new Error('GitHub account must be owner/repository');
      const tag = /^##?\s+(v?\d+\.\d+\.\d+[^\s]*)/m.exec(post.body)?.[1] ?? /\bv\d+\.\d+\.\d+\b/.exec(post.title)?.[0];
      if (!tag) throw new Error('GitHub release needs an explicit version tag in title or heading');
      result = await send(`https://api.github.com/repos/${connection.account}/releases`,
        { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        { tag_name: tag, name: post.title, body: post.body, draft: false });
      url = result.html_url; id = result.id;
    } else {
      result = await send('https://api.postiz.com/public/v1/posts', { Authorization: token }, {
        type: 'now', date: post.scheduledAt, shortLink: false, tags: [], posts: [{ integration: { id: connection.account },
          value: [{ content: [post.title, post.body, post.link].filter(Boolean).join('\n\n'), image: [] }],
          settings: { __type: post.channel } }] });
      const item = Array.isArray(result) ? result[0] : result;
      url = item?.url; id = item?.postId ?? item?.id;
      if (!url) throw new PublishRequestFailure(unknownOutcome);
    }
    if (typeof url !== 'string' || !/^https:\/\//.test(url) || !['string', 'number'].includes(typeof id))
      throw new PublishRequestFailure('Publisher did not return a live URL and ID. ' + unknownOutcome);
    return { channel: post.channel, id: `go:${route}:${id}`, url, status: 'published', scheduledAt: post.scheduledAt };
  } };
}
