import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateFile } from '../core/schema.js';
import { adapters, type Adapter, type Fetch, type Item } from './adapters.js';
export { adapters, normalize } from './adapters.js';
export type { Item } from './adapters.js';
export interface Pain { name: string; description: string; mentions: number; intensity: number; date_range: { start: string; end: string }; quotes: { text: string; url: string }[]; current_tools: string[]; shortcomings: string; solution_feature?: string }
export interface Pains { idea: string; pains: Pain[]; competitors: { name: string; what_they_do: string; complaints: string[] }[] }
export const researchPaths = (cwd: string) => { const root = join(cwd, '.launch/research'); return { root, raw: join(root, 'raw'), pains: join(root, 'pains.json'), report: join(root, 'pain-report.md') }; };
export const painsPath = (cwd: string) => researchPaths(cwd).pains;
export const loadPains = async (cwd: string): Promise<Pains> => JSON.parse(await readFile(painsPath(cwd), 'utf8'));
export async function fetchResearch(cwd: string, queries: string[], options: { fetch?: Fetch; adapters?: Adapter[]; env?: NodeJS.ProcessEnv } = {}) {
  if (!queries.length || queries.some(q => !q.trim())) throw new Error('Provide nonempty research queries');
  const paths = researchPaths(cwd); await mkdir(paths.raw, { recursive: true });
  const results: { source: string; query: string; cached?: boolean; count?: number; skipped?: string }[] = [];
  for (const adapter of options.adapters ?? adapters(options.env)) for (const query of [...new Set(queries)]) {
    const key = createHash('sha256').update(adapter.source + '\0' + query).digest('hex');
    const path = join(paths.raw, `${key}.json`);
    try { const cached = JSON.parse(await readFile(path, 'utf8')); results.push({ source: adapter.source, query, cached: true, count: cached.items.length }); continue; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (adapter.skip) { results.push({ source: adapter.source, query, skipped: adapter.skip }); continue; }
    const responses: { url: string; body: unknown }[] = [];
    const get = async (url: string, headers?: Record<string, string>) => {
      const response = await (options.fetch ?? fetch)(url, { headers });
      if (!response.ok) throw new Error(`${adapter.source}: HTTP ${response.status}; retry after ${response.headers.get('retry-after') ?? response.headers.get('x-ratelimit-reset') ?? 'the source rate limit resets'}`);
      const body = await response.json(); responses.push({ url, body });
      if (body.backoff) throw new Error(`${adapter.source}: backoff ${body.backoff}s; rerun later`);
      return body;
    };
    const items = await adapter.run(query, get);
    await writeFile(path, JSON.stringify({ source: adapter.source, query, responses, items }, null, 2));
    results.push({ source: adapter.source, query, cached: false, count: items.length });
  }
  return { results, next: `Cluster cached evidence, write ${paths.pains}, then run research check and research report. No LLM calls were made.` };
}
export async function cachedItems(cwd: string): Promise<Item[]> {
  const path = researchPaths(cwd).raw;
  let files: string[];
  try { files = await readdir(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  return (await Promise.all(files.filter(f => f.endsWith('.json')).map(async f => JSON.parse(await readFile(join(path, f), 'utf8')).items as Item[]))).flat();
}
const visible = (s: string) => s.replace(/https?:\/\/[^\s)]+/g, '').replace(/\\([\[\]`*_])/g, '$1');
export async function checkResearch(cwd: string, report?: string) {
  const data = await loadPains(cwd); const schema = validateFile('pains', data); const errors = [...schema.errors];
  if (!schema.valid) return { valid: false, errors };
  const items = await cachedItems(cwd);
  for (const pain of data.pains) {
    const independent = new Set<string>();
    for (const quote of pain.quotes) {
      const found = items.filter(i => i.url === quote.url);
      if (!found.length) errors.push(`${pain.name}: unknown URL ${quote.url}`);
      const matched = found.find(i => i.text.includes(quote.text));
      if (!matched) errors.push(`${pain.name}: non-verbatim quote`);
      if (matched) independent.add(`${matched.source}:${matched.author_handle || matched.url}`);
      if (quote.text.trim().split(/\s+/u).length > 25) errors.push(`${pain.name}: quote exceeds 25 words`);
    }
    if (independent.size < 3) errors.push(`${pain.name}: fewer than 3 independent sources`);
  }
  if (report === undefined) { try { report = await readFile(researchPaths(cwd).report, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
  if (report !== undefined) for (const handle of new Set(items.map(i => i.author_handle).filter(Boolean))) {
    if (visible(report).toLowerCase().includes(handle.toLowerCase())) errors.push('Username printed in report');
  }
  return { valid: !errors.length, errors };
}
const cell = (s: string) => s.replace(/[|\n\r]/g, ' ').replace(/[<>]/g, '').replace(/[\[\]`*_]/g, '\\$&');
export async function renderReport(cwd: string) {
  const checked = await checkResearch(cwd, ''); if (!checked.valid) throw new Error(checked.errors.join('; '));
  const data = await loadPains(cwd);
  let features: { name: string; description: string }[] = [];
  try { features = JSON.parse(await readFile(join(cwd, '.launch/product.json'), 'utf8')).features ?? []; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const lines = ['# Pain Report', '', cell(data.idea), '', '| Pain | Mentions | Intensity | What we do about it |', '| --- | --- | --- | --- |'];
  const ranked = [...data.pains].sort((a, b) => b.mentions - a.mentions || b.intensity - a.intensity);
  for (const p of ranked) { const f = features.find(f => f.name === p.solution_feature); lines.push(`| ${cell(p.name)} | ${p.mentions} | ${p.intensity} | ${f ? cell(f.description) : 'not solved yet'} |`); }
  for (const p of ranked) lines.push('', `## ${cell(p.name)}`, cell(p.description), `Dates: ${p.date_range.start} – ${p.date_range.end}`, `Today: ${p.current_tools.map(cell).join(', ')}. Falls short: ${cell(p.shortcomings)}`, ...p.quotes.map(q => `> ${cell(q.text)} — [source](${q.url})`));
  lines.push('', '## Competitors', '| Competitor | What they do | Common complaints |', '| --- | --- | --- |', ...data.competitors.map(c => `| ${cell(c.name)} | ${cell(c.what_they_do)} | ${c.complaints.map(cell).join('; ')} |`));
  const markdown = lines.join('\n') + '\n'; const final = await checkResearch(cwd, markdown);
  if (!final.valid) throw new Error(final.errors.join('; '));
  await writeFile(researchPaths(cwd).report, markdown); return { path: researchPaths(cwd).report, markdown };
}
