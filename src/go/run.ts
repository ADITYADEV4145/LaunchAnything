import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { launchDir } from '../core/launch-dir.js';
import { loadReview, readOptional, validate } from '../review/posts.js';
import { decisions, requireApproval } from '../review/approvals.js';
import { requireConnection, type Connection } from '../connect/registry.js';
import { xCost } from '../connect/costs.js';
import { reserveCap } from '../connect/caps.js';
import { tryLock } from '../connect/lock.js';
import { readReceipts, type PublishReceipt } from '../adapters/index.js';
import { checkPosts } from '../copy/check.js';
import { judgePosts } from '../copy/judge.js';
import { warroom } from '../launch-ops/warroom.js';
import { parseSchedule } from './schedule.js';
import { readConsent, revokeConsent, sameScope, saveConsent, type Scope } from './consent.js';
import { liveAdapter, mockAdapter, routeFor, mcpUnavailableReason, McpPublishingUnavailable, PublishRequestFailure, type GoAdapter } from './adapters.js';

export interface GoOptions {
  confirm?: boolean; yes?: boolean; by?: string; mock?: boolean; noWait?: boolean; revoke?: boolean; phSubmit?: boolean;
  account?: string; home?: string; adapter?: GoAdapter; now?: () => Date; sleep?: (milliseconds: number) => Promise<void>;
  ask?: (message: string) => Promise<boolean>; log?: (message: string) => void;
}
export async function go(cwd = process.cwd(), options: GoOptions = {}) {
  const paths = launchDir(cwd), log = options.log ?? (() => {}), now = options.now ?? (() => new Date());
  if (options.revoke) { await revokeConsent(paths.root); return { mode: 'revoked' as const }; }
  if (options.noWait && !options.mock) throw new Error('--no-wait is only allowed with --mock');
  const rawConfig = JSON.parse(await readOptional(paths.config) ?? '{}');
  const recommendations = await readOptional(join(paths.root, 'recommendations.md'));
  const schedule = parseSchedule(recommendations ?? await readOptional(paths.plan) ?? '', rawConfig.timezone);
  const { config, posts } = await loadReview(cwd, undefined, channel => {
    const slot = schedule.find(slot => slot.channel === channel);
    if (!slot) throw new Error(channel + ': missing schedule row');
    return slot.scheduledAt;
  });
  const { approvals, skips } = await decisions(paths);
  const active = posts.filter(post => skips[post.channel] !== post.hash);
  if (!active.length) throw new Error('No posts to publish');
  const queue = await Promise.all(active.map(async post => {
    let route = 'unsupported', connectionError: string | undefined;
    let connection: Connection = { platform: post.channel, route: 'api', account: options.account ?? '(unconnected account)', connectedAt: '' };
    try {
      route = routeFor(post.channel);
      const expected = route === 'browser' ? 'browser' : route === 'postiz' ? 'postiz' : route.endsWith('api') || route === 'kit-mcp' ? 'api' : 'mcp';
      connection = options.mock ? { platform: post.channel, route: expected, account: options.account ?? 'mock-founder', connectedAt: now().toISOString() }
        : options.confirm ? await requireConnection(post.channel === 'email' ? 'kit' : post.channel, options.account, options.home, cwd)
          : { platform: post.channel, route: expected, account: options.account ?? '(connected account)', connectedAt: '' };
      if (connection.route !== expected) throw new Error(expected === 'mcp' ? mcpUnavailableReason(post.channel)
        : `${post.channel}: go requires ${expected}, connected route is ${connection.route}`);
    } catch (error) { connectionError = error instanceof Error ? error.message : 'Connection unavailable'; }
    const scope: Scope = { channel: post.channel, route, account: connection.account };
    return { post, connection, scope, connectionError };
  }));
  queue.sort((a, b) => a.post.scheduledAt.localeCompare(b.post.scheduledAt));
  const timeline = queue.map(({ post, scope }) => ({ channel: post.channel, route: scope.route,
    at: schedule.find(slot => slot.channel === post.channel)!.local, scheduledAt: post.scheduledAt, status: 'queued' }));
  const cost = ['X API: ' + (posts.find(p => p.channel === 'x') ? xCost(posts.find(p => p.channel === 'x')!, config.xApiCost) : 'no X posts'),
    'Paid tools: Postiz / MCP subscription and usage charges may apply; amounts unknown, check your connected plans.'].join('\n');
  log(cost);
  for (const row of timeline) log(`${row.at} | ${row.channel} | ${row.route} | queued`);
  if (!options.confirm) return { mode: 'dry-run' as const, cost, timeline };
  const diskReceipts = await readReceipts(cwd);
  if (options.mock && diskReceipts.posts.some(post => !post.id.startsWith('go-mock:')))
    throw new Error('Mock publishing requires an isolated launch with no real published receipts');
  if (!options.mock && diskReceipts.posts.some(post => post.id.startsWith('go-mock:')))
    throw new Error('Remove mock fixture receipts before publishing a real launch');
  const release = await tryLock(join(paths.root, 'go.lock'));
  if (!release) throw new Error('Another go run is active; inspect .launch/go.lock');
  const lock = JSON.parse((await readOptional(join(paths.root, 'go.lock')))!);
  const heartbeat = setInterval(() => {
    void writeFile(join(paths.root, 'go.lock'), JSON.stringify({ ...lock, timestamp: Date.now() })).catch(() => {});
  }, 60000);
  heartbeat.unref();
  try {
    const channels = active.map(post => post.channel);
    if (!checkPosts(cwd, channels).passed || !judgePosts(cwd, channels).passed)
      throw new Error('Quality gates failed; run liftoff check and liftoff judge and fix the posts');
    const consent = await readConsent(paths.root, options.mock);
    const missing = queue.filter(({ scope, connectionError }) => !connectionError && !consent.grants.some(grant => sameScope(grant, scope)));
    if (missing.length) {
      const summary = missing.map(({ scope }) => `${scope.channel} via ${scope.route} as ${scope.account}`).join(', ');
      if (!options.yes && !await options.ask?.('Allow standing publishing consent for future content: ' + summary + '?'))
        throw new Error('Standing consent required; ask the founder, then use --confirm --yes (or an interactive terminal)');
      const by = options.by?.trim() || 'Founder';
      consent.grants.push(...missing.map(({ scope }) => ({ ...scope, by, at: now().toISOString() })));
      await saveConsent(paths.root, consent, options.mock);
    }
    const audit = JSON.parse(await readOptional(join(paths.root, 'go-approvals.json')) ?? '{"grants":[]}');
    for (const { post, scope, connectionError } of queue) {
      if (connectionError) continue;
      const grant = consent.grants.find(grant => sameScope(grant, scope))!;
      if (!approvals.some(a => a.channel === post.channel && a.hash === post.hash && a.name === grant.by))
        approvals.push({ channel: post.channel, hash: post.hash, name: grant.by, time: now().toISOString() });
      requireApproval(post, approvals, config.approvers);
      audit.grants.push({ ...scope, hash: post.hash, by: grant.by, at: now().toISOString(), source: 'standing-consent', mock: Boolean(options.mock) });
    }
    await writeFile(options.mock ? join(paths.root, 'approvals.mock.json') : paths.approvals, JSON.stringify({ approvals }, null, 2) + '\n');
    await writeFile(join(paths.root, 'go-approvals.json'), JSON.stringify(audit, null, 2) + '\n');
    const previous = options.mock ? JSON.parse(await readOptional(join(paths.root, 'published.mock.json')) ?? '{"posts":[]}') as { posts: PublishReceipt[] } : await readReceipts(cwd);
    const receipts = [...previous.posts], board: { channel: string; status: string; url?: string; paste?: string }[] = [];
    const adapter = options.adapter ?? (options.mock ? mockAdapter() : liveAdapter());
    const publishedPath = options.mock ? join(paths.root, 'published.mock.json') : paths.published;
    let writes = Promise.resolve();
    const serial = <T>(action: () => Promise<T>): Promise<T> => {
      const result = writes.then(action);
      writes = result.then(() => {}, () => {});
      return result;
    };
    const profiles = new Map<string, Promise<void>>();
    const withProfile = <T>(profile: string, action: () => Promise<T>): Promise<T> => {
      const key = resolve(profile);
      const result = (profiles.get(key) ?? Promise.resolve()).then(action);
      profiles.set(key, result.then(() => {}, () => {}));
      return result;
    };
    const identityFor = (hash: string, scope: Scope) => (options.mock ? 'go-mock:' : 'go:') +
      createHash('sha256').update(JSON.stringify([hash, scope])).digest('hex');
    if (queue.some(({ post, scope, connectionError }) => !connectionError && post.channel === 'product-hunt' &&
      !receipts.some(receipt => receipt.id === identityFor(post.hash, scope) && receipt.status === 'published')) && !options.phSubmit &&
      !await options.ask?.('Product Hunt: confirm final Submit for this launch?'))
      throw new Error('PH final submission needs founder confirmation (--ph-submit after explicit approval)');
    const completed = await Promise.allSettled(queue.map(async ({ post, connection, scope, connectionError }) => {
      const identity = identityFor(post.hash, scope);
      const existing = receipts.find(receipt => receipt.id === identity && receipt.status === 'published');
      if (existing) { board.push({ channel: post.channel, status: 'live', url: existing.url }); log(`${post.channel} | live | ${existing.url}`); return; }
      let remaining = Date.parse(post.scheduledAt) - now().getTime();
      while (!connectionError && !options.noWait && remaining > 0) {
        await (options.sleep ?? setTimeout)(Math.min(remaining, 2147483647));
        remaining = Date.parse(post.scheduledAt) - now().getTime();
      }
      const dispatch = async () => {
      let receipt: PublishReceipt | undefined;
      let unavailableReason = connectionError;
      try {
        if (connectionError) throw new Error(connectionError);
        if (!options.mock) await serial(() => reserveCap(paths.root, post.channel, connection.account, now()));
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (!(await readConsent(paths.root, options.mock)).grants.some(grant => sameScope(grant, scope)))
              throw new Error('Standing consent revoked before attempt: ' + post.channel);
            const current = options.mock ? validate<{ approvals: typeof approvals }>('approvals',
              JSON.parse(await readOptional(join(paths.root, 'approvals.mock.json')) ?? '{"approvals":[]}'))
              : await decisions(paths);
            requireApproval(post, current.approvals, config.approvers);
            receipt = await adapter.publish({ post, connection, root: paths.root, notify: message => log('\u0007' + message) });
            if (receipt.status !== 'published' || !receipt.url || !/^https:\/\//.test(receipt.url)) throw new Error('No live URL returned');
            break;
          } catch (error) {
            if (error instanceof McpPublishingUnavailable) unavailableReason = error.message;
            if (error instanceof PublishRequestFailure) unavailableReason = error.message;
            receipt = undefined;
            if (error instanceof PublishRequestFailure ? !error.retryable : !options.mock && scope.route !== 'browser') break;
          }
        }
      } catch { receipt = undefined; }
      if (!receipt) {
        const reason = unavailableReason ?? (!options.mock && ['official-mcp', 'kit-mcp'].includes(scope.route)
          ? mcpUnavailableReason(post.channel) : 'Dispatch failed after retry; no live URL was captured.');
        const folder = join(paths.root, 'go-paste');
        await mkdir(folder, { recursive: true });
        const paste = join(folder, `${post.channel}-${post.hash}.md`);
        await writeFile(paste, `# ${post.title}\n\n${post.body}\n\n${post.link ?? ''}\n\nAttachments:\n${post.media.map(m => m.path).join('\n')}\n\n${reason}\nInspect the destination for duplicates before submitting manually.\n`);
        board.push({ channel: post.channel, status: 'failed', paste }); log(`${post.channel} | failed | ${reason} | ${paste}`);
        return;
      }
      receipt.id = identity;
      const live = receipt;
      await serial(async () => {
        receipts.push(live);
        validate('published', { posts: receipts });
        await writeFile(publishedPath, JSON.stringify({ posts: receipts }, null, 2) + '\n');
        if (options.mock) await writeFile(paths.published, JSON.stringify({ posts: receipts }, null, 2) + '\n');
        await warroom(cwd, { readStatus: async () => ({ status: 'published' }) });
      });
      board.push({ channel: post.channel, status: 'live', url: receipt.url }); log(`${post.channel} | live | ${receipt.url}`);
      };
      return scope.route === 'browser' ? withProfile(connection.profile ?? 'mock-default', dispatch) : dispatch();
    }));
    const failure = completed.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return { mode: options.mock ? 'mock' as const : 'live' as const, cost, timeline, board, path: publishedPath };
  } finally { clearInterval(heartbeat); await release(); }
}
