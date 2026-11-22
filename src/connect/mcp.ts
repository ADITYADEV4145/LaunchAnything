import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ReviewPost } from '../review/posts.js';
import type { PublishReceipt } from '../adapters/index.js';
import { frontMatter } from './forms.js';
import { sectionsOf } from '../copy/template.js';
import { productHuntDate } from './payloads.js';
import { builtinSiteMetadata, site } from '../core/registry.js';

export type McpPlatform = 'product-hunt' | 'x';
export const officialServers = Object.fromEntries(Object.entries(builtinSiteMetadata())
  .filter(([, site]) => site.assisted?.mcpServer).map(([id, site]) => [id, site.assisted!.mcpServer!])) as Record<McpPlatform, string>;
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

async function sseResponse(response: Response, id: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Invalid official MCP response');
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: RegExpExecArray | null;
      while ((newline = /\r\n|\r|\n/.exec(buffer))) {
        if (!done && newline[0] === '\r' && newline.index === buffer.length - 1) break;
        const line = buffer.slice(0, newline.index);
        buffer = buffer.slice(newline.index + newline[0].length);
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        else if (!line) {
          const source = data.join('\n');
          data = [];
          if (!source.trim()) continue;
          const message = JSON.parse(source);
          if (message?.id === id) return message;
        }
      }
      if (done) throw new Error('Invalid official MCP response');
    }
  } finally {
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
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
    const message = response.headers.get('content-type')?.includes('text/event-stream')
      ? await sseResponse(response, id) : await response.json();
    if (!message || typeof message !== 'object' || message.id !== id || message.error || !('result' in message))
      throw new Error('Invalid official MCP response');
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
      : { launch_id: 'draft-1', status: 'draft', url: builtinSiteMetadata()['product-hunt'].submitUrl, assessment: { submission: 'no_known_blockers' } } })) {}
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
  const target = site(post.channel, dirname(root));
  if (target.custom || post.channel !== platform || !target.assisted?.routes.includes('mcp'))
    throw new Error(post.channel + ': no built-in MCP publishing route available');
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
  const { lead, sections } = sectionsOf(post.body);
  const maker = sections.get('## Maker comment');
  const draft = await call('start_launch', { url: post.link, idempotency_key: `liftoff-${post.hash}`,
    values: { name: extra.name ?? post.title, tagline: extra.tagline ?? post.title, description: lead || post.body,
      commentBody: extra.makerComment ?? maker ?? post.body, launchDate: productHuntDate(post.scheduledAt) } });
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
