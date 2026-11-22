import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { xCost, xCostDetails, type XApiCost } from '../connect/costs.js';
import { parsePost } from '../copy/check.js';

export function estimate(cwd: string, stage = 'all', formatCount = stage === 'demo' ? 1 : 3) {
  if (!['all', 'write', 'video', 'publish', 'demo'].includes(stage)) throw new Error('Stage must be all, write, video, publish or demo');
  const warnings: string[] = [];
  const text = (path: string) => {
    try { return readFileSync(join(cwd, path), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push(`Could not read ${path}`);
      return '';
    }
  };
  const plan = text('.launch/plan.md');
  const channels = [...new Set([...plan.matchAll(/^\| ([a-z][a-z-]*) \| \d{4}-/gm)].map(m => m[1]))];
  let posts = '';
  try { posts = readdirSync(join(cwd, '.launch/posts')).filter(f => f.endsWith('.md')).map(f => text('.launch/posts/' + f)).join('\n'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('Could not read .launch/posts'); }
  const inputTokens = Math.ceil((text('README.md') + text('.launch/product.json') + text('.launch/brief.md') + posts).length / 4);
  const outputTokens = channels.length * 600;
  const script = text('.launch/video/script.json');
  let scenes = 6;
  if (script) {
    try {
      const data: unknown = JSON.parse(script);
      if (!data || typeof data !== 'object' || !('scenes' in data) || !Array.isArray(data.scenes)) throw new Error('Invalid scenes');
      scenes = data.scenes.length;
    } catch { warnings.push('Could not read scenes from .launch/video/script.json; assuming 6 scenes'); }
  }
  const xText = text('.launch/posts/x.md');
  let xPost: ReturnType<typeof parsePost> | undefined;
  if (xText) {
    try { xPost = parsePost(xText); }
    catch { warnings.push('Could not parse .launch/posts/x.md; assuming one X post with a URL'); }
  }
  const parts = xPost ? xPost.body.split(/\r?\n---\r?\n/) : [''];
  const xPosts = channels.includes('x') ? parts.length : 0;
  let pricing: XApiCost = {};
  const config = text('.launch/config.json');
  if (config) {
    try {
      const data = JSON.parse(config);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid config');
      if (data.xApiCost !== undefined) {
        if (!data.xApiCost || typeof data.xApiCost !== 'object' || Array.isArray(data.xApiCost)) throw new Error('Invalid pricing');
        pricing = data.xApiCost;
      }
    } catch {
      warnings.push('Could not read X API pricing from .launch/config.json; cost unknown');
      pricing = { create: null, withUrl: null };
    }
  }
  const rates = channels.includes('x') ? parts.map(body => {
    const post = { title: xPost?.title ?? '', body, ...(!xPost ? { link: 'https://example.test' } : xPost.link ? { link: xPost.link } : {}) };
    try { return { label: xCost(post, pricing), amount: xCostDetails(post, pricing).amount }; }
    catch {
      warnings.push('Invalid X API cost configuration; cost unknown');
      return { label: 'cost unknown — set it in config', amount: null };
    }
  }) : [];
  return { stage, estimated: true, warnings, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, channels,
    xPosts, xApiUsd: rates.some(rate => rate.amount === null) ? null : rates.reduce((sum, rate) => sum + rate.amount!, 0),
    xPricing: rates.map(rate => rate.label),
    renderSeconds: scenes * formatCount * 2, scenes, formats: formatCount,
    assumptions: `Estimates only: chars/4 input tokens; 600 output tokens/channel; 2s/scene/format conservative render heuristic (bundled 6-scene square demo measured ~3–6s on Linux; hardware dependent), ${formatCount} formats. X direct API rates; no API or LLM calls.` };
}
export function printEstimate(cwd: string, stage: string, json?: boolean, formatCount?: number) {
  try {
    const result = estimate(cwd, stage, formatCount);
    if (!json) {
      console.log(`Estimate: ~${result.totalTokens} agent tokens; X API ${result.xApiUsd === null ? 'cost unknown' : '~$' + result.xApiUsd.toFixed(3)}; render ~${result.renderSeconds}s (estimates only).`);
      for (const warning of result.warnings) console.warn(`Estimate: ${warning}`);
    }
    return result;
  } catch {
    const result = { stage, estimated: false, warnings: ['Estimate unavailable; could not read estimation inputs'] };
    if (!json) console.warn(result.warnings[0]);
    return result;
  }
}
