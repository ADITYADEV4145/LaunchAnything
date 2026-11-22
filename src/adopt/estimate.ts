import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultXApiCost, xCost } from '../connect/costs.js';
import { parsePost } from '../copy/check.js';

export function estimate(cwd: string, stage = 'all', formatCount = stage === 'demo' ? 1 : 3) {
  if (!['all', 'write', 'video', 'publish', 'demo'].includes(stage)) throw new Error('Stage must be all, write, video, publish or demo');
  const text = (path: string) => existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), 'utf8') : '';
  const plan = text('.launch/plan.md');
  const channels = [...new Set([...plan.matchAll(/^\| ([a-z][a-z-]*) \| \d{4}-/gm)].map(m => m[1]))];
  const posts = existsSync(join(cwd, '.launch/posts')) ? readdirSync(join(cwd, '.launch/posts')).filter(f => f.endsWith('.md')).map(f => text('.launch/posts/' + f)).join('\n') : '';
  const inputTokens = Math.ceil((text('README.md') + text('.launch/product.json') + text('.launch/brief.md') + posts).length / 4);
  const outputTokens = channels.length * 600;
  const script = text('.launch/video/script.json');
  const scenes = script ? (JSON.parse(script).scenes?.length ?? 0) : 6;
  const xText = text('.launch/posts/x.md');
  const xPost = xText ? parsePost(xText) : undefined;
  const parts = xPost ? xPost.body.split(/\r?\n---\r?\n/) : [''];
  const xPosts = channels.includes('x') ? parts.length : 0;
  const rates = parts.map(body => xCost({ title: xPost?.title ?? '', body, ...(!xPost ? { link: 'https://example.test' } : xPost.link ? { link: xPost.link } : {}) }));
  return { stage, estimated: true, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, channels,
    xPosts, xApiUsd: channels.includes('x') ? rates.reduce((sum, rate) => sum + (rate.includes('(with URL)') ? defaultXApiCost.withUrl : defaultXApiCost.create), 0) : 0,
    xPricing: rates,
    renderSeconds: scenes * formatCount * 2, scenes, formats: formatCount,
    assumptions: `Estimates only: chars/4 input tokens; 600 output tokens/channel; 2s/scene/format conservative render heuristic (bundled 6-scene square demo measured ~3–6s on Linux; hardware dependent), ${formatCount} formats. X direct API rates; no API or LLM calls.` };
}
export function printEstimate(cwd: string, stage: string, json?: boolean, formatCount?: number) {
  const result = estimate(cwd, stage, formatCount);
  if (!json) console.log(`Estimate: ~${result.totalTokens} agent tokens; X API ~$${result.xApiUsd.toFixed(3)}; render ~${result.renderSeconds}s (estimates only).`);
  return result;
}
