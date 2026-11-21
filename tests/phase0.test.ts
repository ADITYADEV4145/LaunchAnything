import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adapters, normalize, fetchResearch, researchPaths, checkResearch, renderReport } from '../src/research/index.js';
const fixture = JSON.parse(await readFile(new URL('../fixtures/cli-tool/.liftoff-fixture/phase0-recording.json', import.meta.url), 'utf8'));
let cwd: string;
beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), 'phase0-')); });
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });
async function seed() {
  const network = vi.fn(async () => new Response(JSON.stringify(fixture.hn)));
  const options = { fetch: network as typeof fetch, adapters: [adapters({})[0]] };
  await fetchResearch(cwd, ['launch'], options);
  await writeFile(researchPaths(cwd).pains, JSON.stringify(fixture.pains));
  return { network, options };
}
it('normalizes recorded evidence and caches raw responses with zero calls on hit', async () => {
  expect(normalize('hn', fixture.hn)).toHaveLength(15);
  const { network, options } = await seed();
  expect((await fetchResearch(cwd, ['launch'], options)).results[0].cached).toBe(true);
  expect(network).toHaveBeenCalledTimes(1);
  expect((await checkResearch(cwd)).valid).toBe(true);
});
it('decodes visible HTML entities and separates paragraphs for verbatim quotes', async () => {
  const text = "I can't ship “today” — really… Next line © & < > 😀";
  const raw = structuredClone(fixture.hn);
  raw.hits[0].comment_text = '<p>I can&#x27;t ship &ldquo;today&rdquo; &mdash; really&hellip;</p><p>Next<br>line &#169; &amp; &lt; &gt; &#x1F600;</p>';
  expect(normalize('hn', raw)[0].text).toBe(text);
  expect(normalize('hn', { hits: [{ objectID: '1', comment_text: '&#0; &#x110000; &unknown;' }] })[0].text).toBe('&#0; &#x110000; &unknown;');
  await fetchResearch(cwd, ['entities'], { fetch: async () => new Response(JSON.stringify(raw)), adapters: [adapters({})[0]] });
  const data = structuredClone(fixture.pains); data.pains[0].quotes[0].text = text;
  await writeFile(researchPaths(cwd).pains, JSON.stringify(data));
  expect((await checkResearch(cwd)).valid).toBe(true);
});
it('skips absent credentials and rejects empty queries and HTTP failures', async () => {
  const network = vi.fn();
  const result = await fetchResearch(cwd, ['launch'], { fetch: network, adapters: adapters({}).filter(a => a.skip) });
  expect(result.results.every(r => r.skipped)).toBe(true);
  expect(network).not.toHaveBeenCalled();
  await expect(fetchResearch(cwd, [])).rejects.toThrow('nonempty');
  await expect(fetchResearch(cwd, ['launch'], { adapters: [adapters({})[0]], fetch: async () => new Response('', { status: 429, headers: { 'retry-after': '60' } }) })).rejects.toThrow('HTTP 429');
});
it.each(['schema', 'non-verbatim', 'unknown URL', 'independent', '25 words', 'username'])('rejects %s failure', async kind => {
  await seed(); const data = structuredClone(fixture.pains);
  if (kind === 'schema') delete data.pains[0].name;
  if (kind === 'non-verbatim') data.pains[0].quotes[0].text = 'Invented words';
  if (kind === 'unknown URL') data.pains[0].quotes[0].url = 'https://example.test/missing';
  if (kind === 'independent') data.pains[0].quotes = Array(3).fill(data.pains[0].quotes[0]);
  if (kind === '25 words') data.pains[0].quotes[0].text = Array(26).fill('word').join(' ');
  if (kind === 'username') await writeFile(researchPaths(cwd).report, 'fixture_person_0_0 said this');
  await writeFile(researchPaths(cwd).pains, JSON.stringify(data));
  const result = await checkResearch(cwd);
  expect(result.valid).toBe(false);
  if (kind !== 'schema') expect(result.errors.join(' ').toLowerCase()).toContain(kind.toLowerCase());
});
it('renders ranked pains, competitor complaints and product matches without usernames', async () => {
  await seed();
  await writeFile(join(cwd, '.launch/product.json'), JSON.stringify({ features: [{ name: 'Scheduling', description: 'Automatic scheduling' }] }));
  const result = await renderReport(cwd);
  expect(result.markdown).toContain('Automatic scheduling');
  expect(result.markdown).toContain('not solved yet');
  expect(result.markdown).toContain('Common complaints');
  expect(result.markdown).not.toContain('fixture_person');
  expect((await checkResearch(cwd)).valid).toBe(true);
});
it('escapes Markdown quote punctuation without changing the displayed evidence', async () => {
  const text = 'Use <draft> | > and &lt; safely';
  const raw = structuredClone(fixture.hn);
  raw.hits[0].comment_text = 'Use &lt;draft&gt; | &gt; and &amp;lt; safely';
  await fetchResearch(cwd, ['punctuation'], { fetch: async () => new Response(JSON.stringify(raw)), adapters: [adapters({})[0]] });
  const data = structuredClone(fixture.pains); data.pains[0].quotes[0].text = text;
  await writeFile(researchPaths(cwd).pains, JSON.stringify(data));
  const { markdown } = await renderReport(cwd);
  const quote = markdown.split('\n').find(line => line.startsWith('> Use '))!.slice(2).split(' — [source]')[0];
  expect(quote).toContain('&lt;draft&gt; \\| &gt;');
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>' };
  const displayed = quote.replace(/\\([\\|\[\]`*_])/g, '$1').replace(/&(amp|lt|gt);/g, (_, name: string) => entities[name]);
  expect(displayed).toBe(text);
  expect((await checkResearch(cwd)).valid).toBe(true);
});
it('handles empty normalized results', () => {
  for (const source of ['hn', 'reddit', 'github', 'stackoverflow', 'product-hunt', 'x', 'app-store']) expect(normalize(source, {})).toEqual([]);
});
it('fetches issues and enabled discussions from at most five related repositories', async () => {
  const get = vi.fn(async (url: string) => url.includes('/search/repositories')
    ? { items: Array.from({ length: 6 }, (_, i) => ({ full_name: `example/app${i}`, has_discussions: i === 0 })) }
    : url.includes('/discussions') ? [] : { items: [] });
  const github = adapters({}).find(a => a.source === 'github')!;
  expect(await github.run('launch', get)).toEqual([]);
  expect(get).toHaveBeenCalledTimes(7);
  expect(get.mock.calls.filter(([url]) => url.includes('/discussions'))).toHaveLength(1);
});
it('normalizes recorded source payloads into the common evidence contract', async () => {
  const samples = JSON.parse(await readFile(new URL('../fixtures/cli-tool/.liftoff-fixture/phase0-adapters.json', import.meta.url), 'utf8'));
  for (const [source, raw] of Object.entries(samples)) {
    const items = normalize(source, raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source, text: expect.stringContaining('I lost my launch draft'), date: expect.stringMatching(/^2026-01-01T00:00:00/), url: expect.stringMatching(/^https:\/\//), author_handle: expect.any(String), score: expect.any(Number), replies: expect.any(Number) });
  }
});
