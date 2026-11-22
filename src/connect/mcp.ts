import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReviewPost } from '../review/posts.js';
import type { PublishReceipt } from '../adapters/index.js';
import { frontMatter } from './forms.js';
import { productHuntDate } from './payloads.js';

export type McpPlatform = 'product-hunt' | 'x';
export const officialServers = { 'product-hunt': 'https://mcp.producthunt.com/mcp', x: 'https://api.x.com/mcp' } as const;
// Verified with the official tools/list: start_launch creates an unsubmitted draft only.
export const productHuntTools = ['start_launch', 'get_launch', 'get_launch_preview_view'] as const;
export interface McpTool { name: string }
export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export function allowTool(platform: McpPlatform, name: string) {
  if (platform !== 'product-hunt' || !productHuntTools.includes(name as typeof productHuntTools[number]))
    throw new Error('MCP tool refused: only verified draft, readiness and preview tools are allowed; never submit or publish');
}

export class HttpMcpClient implements McpClient {
  private session?: string;
  private initialized?: Promise<void>;
  private nextId = 0;
  constructor(private platform: McpPlatform, private token: string, private request: typeof fetch = fetch) {}
  private async rpc(method: string, params: unknown, notification = false): Promise<any> {
    const id = ++this.nextId;
    const response = await this.request(officialServers[this.platform], {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18',
        ...(this.session ? { 'Mcp-Session-Id': this.session } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(!notification && { id }), method, params }),
    });
    if (!response.ok) throw new Error('Official MCP request failed; reconnect your own account');
    this.session = response.headers.get('mcp-session-id') ?? this.session;
    if (notification) return;
    const source = await response.text();
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
      ? source.split(/\r?\n\r?\n/).filter(block => /^data:/m.test(block)).map(block =>
        JSON.parse(block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')))
      : [JSON.parse(source)];
    const message = messages.find(item => item.id === id);
    if (!message || message.error || !('result' in message)) throw new Error('Invalid official MCP response');
    return message.result;
  }
  private ready() {
    return this.initialized ??= (async () => {
      await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'liftoff', version: '0.1.0' } });
      await this.rpc('notifications/initialized', {}, true);
    })();
  }
  async listTools(): Promise<McpTool[]> {
    await this.ready();
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.rpc('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(result.tools) || result.tools.some((tool: McpTool) => typeof tool?.name !== 'string'))
        throw new Error('Invalid MCP capabilities');
      tools.push(...result.tools);
      cursor = result.nextCursor;
      if (cursor && typeof cursor !== 'string' || tools.length > 1000) throw new Error('Invalid MCP capability pagination');
    } while (cursor);
    return tools;
  }
  async callTool(name: string, args: Record<string, unknown>) {
    allowTool(this.platform, name);
    await this.ready();
    return this.rpc('tools/call', { name, arguments: args });
  }
}

export class MockMcpClient implements McpClient {
  calls: { name: string; args: Record<string, unknown> }[] = [];
  discoveries = 0;
  constructor(public platform: McpPlatform, public tools: McpTool[] = productHuntTools.map(name => ({ name })),
    public respond: (name: string, args: Record<string, unknown>) => unknown = name => ({ status: 'ok', data: name === 'get_launch_preview_view'
      ? { composer: { title: 'Draft preview' } }
      : { launch_id: 'draft-1', status: 'draft', url: 'https://www.producthunt.com/posts/new', assessment: { submission: 'no_known_blockers' } } })) {}
  async listTools() { this.discoveries++; return this.tools; }
  async callTool(name: string, args: Record<string, unknown>) {
    allowTool(this.platform, name);
    this.calls.push({ name, args });
    return this.respond(name, args);
  }
}

function data(result: any) {
  if (result?.isError) throw new Error('Official MCP tool failed');
  const value = result?.structuredContent ?? (Array.isArray(result?.content)
    ? JSON.parse(result.content.find((item: any) => item.type === 'text')?.text ?? 'null') : result);
  if (value?.status !== 'ok' || !value.data || typeof value.data !== 'object') throw new Error('Official MCP tool failed');
  return value.data;
}

export async function mcpDraft(platform: McpPlatform, client: McpClient, post: ReviewPost, root: string): Promise<PublishReceipt> {
  const tools = await client.listTools();
  // No ordinary post-create tool is verified in https://docs.x.com/tools/mcp.
  // Discovery alone never authorizes an unfamiliar write tool.
  if (platform === 'x') throw new Error('No verified official X post-create tool; use the retained manual paste file');
  if (productHuntTools.some(name => !tools.some(tool => tool.name === name))) throw new Error('Required official PH draft tools unavailable');
  const call = async (name: string, args: Record<string, unknown>) => {
    allowTool(platform, name);
    return data(await client.callTool(name, args));
  };
  const extra = frontMatter(post);
  const draft = await call('start_launch', { url: post.link, idempotency_key: `liftoff-${post.hash}`,
    values: { name: extra.name ?? post.title, tagline: extra.tagline ?? post.title, description: post.body,
      commentBody: extra.makerComment ?? post.body, launchDate: productHuntDate(post.scheduledAt) } });
  if (typeof draft.launch_id !== 'string' || draft.status !== 'draft') throw new Error('PH did not return an unsubmitted draft');
  const readiness = await call('get_launch', { launch_id: draft.launch_id });
  if (readiness.status !== 'draft' || !['blocked', 'no_known_blockers'].includes(readiness.assessment?.submission))
    throw new Error('PH readiness check unavailable');
  const preview = await call('get_launch_preview_view', { launch_id: draft.launch_id });
  if (!preview.composer || typeof preview.composer !== 'object') throw new Error('PH preview unavailable');
  const url = new URL(readiness.url);
  if (url.protocol !== 'https:' || !['www.producthunt.com', 'producthunt.com'].includes(url.hostname)) throw new Error('Invalid PH draft URL');
  const folder = join(root, 'review', 'mcp', post.hash);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'product-hunt-preview.json'), JSON.stringify({ url: url.href,
    readiness: readiness.assessment, preview: preview.composer, instruction: 'Review readiness and preview, then submit yourself on Product Hunt. Local attachments must be added on Product Hunt.' }, null, 2) + '\n');
  return { channel: post.channel, id: `mcp:product-hunt:${post.hash}`, status: 'manual', url: url.href, scheduledAt: post.scheduledAt };
}
