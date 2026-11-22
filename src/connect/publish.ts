import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadReview, mediaType, readOptional } from '../review/posts.js';
import { decisions, requireApproval } from '../review/approvals.js';
import { getAdapter, readReceipts } from '../adapters/index.js';
import type { PublishReceipt } from '../adapters/index.js';
import { requireConnection } from './registry.js';
import { chromeBrowser, type BrowserDriver } from './browser.js';
import { forms, fillForm, frontMatter, type BrowserPlatform } from './forms.js';
import { reserveCap } from './caps.js';
import { assistedReminder, instagramPayload } from './payloads.js';
import { HttpMcpClient, mcpDraft, type McpClient, type McpPlatform } from './mcp.js';
import { osKeychain, type Keychain } from './keychain.js';
import { site } from '../core/registry.js';
import { adapterMetadata } from '../adapters/metadata.js';

export interface AssistOptions { channel?: string; account?: string; home?: string; browser?: (profile: string) => Promise<BrowserDriver>; now?: Date; timeout?: number;
  keychain?: Keychain; mcp?: (platform: McpPlatform, token: string) => Promise<McpClient> }
export async function assistedPublish(cwd: string | undefined, options: AssistOptions = {}) {
  if (options.channel) site(options.channel, cwd);
  const { paths, config, posts } = await loadReview(cwd);
  const { approvals, skips } = await decisions(paths);
  const selected = posts.filter(p => (!options.channel || p.channel === options.channel) && skips[p.channel] !== p.hash);
  if (!selected.length) throw new Error('No matching approved posts to assist');
  const plan = await readOptional(paths.plan);
  const order = plan?.split('\n').map(line => line.split('|')[1]?.trim()) ?? [];
  selected.sort((a, b) => {
    const rank = (channel: string) => order.includes(channel) ? order.indexOf(channel) : Number.MAX_SAFE_INTEGER;
    return rank(a.channel) - rank(b.channel);
  });
  const queue = [];
  for (const post of selected) {
    if (site(post.channel, cwd).custom)
      throw new Error(post.channel + ': custom sites only support offline staging; use publish --confirm without --assist');
    requireApproval(post, approvals, config.approvers);
    const connection = await requireConnection(post.channel, options.account, options.home, cwd);
    const route = adapterMetadata.find(adapter => adapter.connectionRoute === connection.route && adapter.channels.includes(post.channel))?.id ?? connection.route;
    const adapter = ['browser', 'mcp'].includes(connection.route) ? undefined : getAdapter(post.channel, route + ':', cwd);
    if (adapter) {
      if (adapter.name !== route) throw new Error(`${post.channel}: unsupported connected route ${connection.route}`);
      adapter.validate(post, cwd);
      if (route === 'linkedin-api' && !/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(connection.account))
        throw new Error('LinkedIn direct API requires your author urn:li:person:ID or urn:li:organization:ID');
    } else if (connection.route === 'mcp') {
      if (post.channel === 'product-hunt' && !/^https?:\/\//i.test(post.link ?? '')) throw new Error('Product Hunt MCP requires a product link');
    } else if (!Object.hasOwn(forms, post.channel)) throw new Error(`${post.channel}: no browser form available`);
    let instagram;
    if (post.channel === 'instagram') {
      const extra = frontMatter(post);
      const hashtags = extra.hashtags ?? [];
      if (!Array.isArray(hashtags) || hashtags.some(tag => typeof tag !== 'string'))
        throw new Error('Instagram hashtags must be a list of strings');
      instagram = instagramPayload({ gallery: post.media.filter(m => mediaType(m.path)?.startsWith('image/')).map(m => m.path),
        verticalVideo: post.media.find(m => mediaType(m.path)?.startsWith('video/') && /9[x:–-]16/i.test(m.slot + ' ' + m.path))?.path ?? '',
        caption: post.body, hashtags, coverFrame: extra.coverFrame === undefined ? 0 : extra.coverFrame as number });
    }
    queue.push({ post, connection, adapter, instagram });
  }
  const receipts: PublishReceipt[] = [];
  const warnings: string[] = [];
  for (const { post, connection, adapter, instagram } of queue) {
    await reserveCap(paths.root, post.channel, connection.account, options.now);
    const dispatch = async (): Promise<PublishReceipt> => {
      let receipt: PublishReceipt | undefined;
      if (connection.route === 'mcp') {
        const token = await (options.keychain ?? osKeychain()).get(`${post.channel}:${connection.account}`);
        if (!token) throw new Error('MCP token unavailable; reconnect your own account');
        const platform = post.channel as McpPlatform;
        const client = await (options.mcp?.(platform, token) ?? Promise.resolve(new HttpMcpClient(platform, token)));
        receipt = await mcpDraft(platform, client, post, paths.root);
      } else if (adapter) {
        receipt = await adapter.schedule(post, cwd);
        if (adapter.name === 'linkedin-api') await writeFile(new URL('linkedin-api-request.json', receipt.url), JSON.stringify({
          method: 'POST', url: adapterMetadata.find(metadata => metadata.id === adapter.name)!.requestUrl,
          instruction: 'Offline request only. Use your OS-keychain token and a supported LinkedIn-Version header with the official API; never automate the website.',
          body: { author: connection.account, commentary: [post.title, post.body,
            !post.linkFirstComment && post.link && !post.body.includes(post.link) ? post.link : undefined].filter(Boolean).join('\n\n'), visibility: 'PUBLIC',
            distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false },
        }, null, 2) + '\n');
        if (instagram) await writeFile(new URL('instagram-payload.json', receipt.url), JSON.stringify(instagram, null, 2) + '\n');
      } else {
        await writeFile(join(paths.root, `${post.channel}-assisted.ics`), assistedReminder(post.channel, post.scheduledAt));
        const driver = await (options.browser ?? chromeBrowser)(connection.profile!);
        let cleanup: (() => Promise<void>) | undefined;
        try {
          cleanup = await fillForm(driver, post, paths.root);
          const url = await driver.waitForUrl(forms[post.channel as BrowserPlatform].result, options.timeout ?? 600000);
          receipt = { channel: post.channel, id: `browser:${post.channel}:${post.hash}`, url, status: 'published', scheduledAt: post.scheduledAt };
        } finally {
          try { await driver.close(); }
          catch (error) { if (!receipt) throw error; warnings.push(`${post.channel}: browser close failed after URL capture`); }
          finally {
            try { await cleanup?.(); }
            catch (error) { if (!receipt) throw error; warnings.push(`${post.channel}: approved upload cleanup failed`); }
          }
        }
      }
      return receipt;
    };
    let receipt: PublishReceipt | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { receipt = await dispatch(); break; }
      catch {
        if (attempt === 1) {
          receipt = await getAdapter(post.channel, undefined, cwd).schedule(post, cwd);
          const reason = connection.route === 'mcp' && post.channel === 'x'
            ? 'No verified official X post-create tool available. Discovery never authorizes an unfamiliar write tool.'
            : 'Assisted dispatch failed twice. Inspect the destination for an existing post before using the paste file.';
          await writeFile(new URL('failure.json', receipt.url), JSON.stringify({ attempts: 2, status: 'manual', reason }, null, 2) + '\n');
          warnings.push(`${post.channel}: ${reason} Retained manual paste file: ${receipt.url}`);
        }
      }
    }
    if (!receipt) throw new Error(`${post.channel}: unable to retain a publish receipt`);
    const previous = await readReceipts(cwd);
    const current = receipt;
    const merged = previous.posts.filter(p => p.channel !== current.channel || p.id !== current.id);
    await writeFile(paths.published, JSON.stringify({ posts: [...merged, receipt] }, null, 2) + '\n');
    receipts.push(receipt);
  }
  return { mode: 'assisted', posts: receipts, warnings };
}
