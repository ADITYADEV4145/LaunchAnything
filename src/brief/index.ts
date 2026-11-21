import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { validateFile } from '../core/schema.js';

interface Pain { name: string; description: string; mentionCount: number; dateRange: { start: string; end: string }; quotes: { text: string; url: string }[]; currentSolutions: string[]; shortcomings: string }
interface Product { name: string; oneLiner: string; audience: string; problem: string; proofPoints: string[]; features: { name: string; description: string; sources: { ref: string }[] }[] }
const rules = parse(readFileSync(join(packageRoot(), 'rules/brief.yaml'), 'utf8')) as { version: number; faqMin: number; faqMax: number; sections: { title: string; words: number }[] };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const excerpt = (s: string, limit: number) => s.trim().split(/\s+/).slice(0, Math.max(0, limit)).join(' ');
function budgetEntries(entries: { prefix: string; text: string; suffix: string }[], limit: number) {
  const required = entries.reduce((sum, entry) => sum + words(entry.prefix) + words(entry.suffix), 0);
  const allowance = Math.max(0, Math.floor((limit - required) / Math.max(1, entries.length)));
  return entries.map(entry => [entry.prefix, excerpt(entry.text, allowance), entry.suffix].filter(Boolean).join(' ')).join('\n');
}
const url = (s: string) => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
function inputs(cwd: string) {
  const root = launchDir(cwd).root;
  const productText = readFileSync(join(root, 'product.json'), 'utf8');
  const product = JSON.parse(productText) as Product;
  const checked = validateFile('product', product);
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const plan = readFileSync(join(root, 'plan.md'), 'utf8');
  const painPath = join(root, 'research/pains.json');
  const painText = existsSync(painPath) ? readFileSync(painPath, 'utf8') : '';
  if (painText) {
    const checked = validateFile('pains', JSON.parse(painText));
    if (!checked.valid) throw new Error('Invalid pains[]: ' + checked.errors.join('; '));
  }
  const pains = painText ? (JSON.parse(painText) as { pains: Pain[] }).pains : [];
  if (!Array.isArray(pains)) throw new Error('pains.json must contain pains[]');
  for (const pain of pains) {
    if (!pain.name || !pain.description || !Array.isArray(pain.quotes) || pain.quotes.length < 3 || pain.quotes.length > 5 ||
      pain.quotes.some(q => !q.text || words(q.text) > 25 || !url(q.url))) throw new Error('Invalid pain: expected name, description and 3–5 linked quotes of at most 25 words');
  }
  const hash = createHash('sha256').update(JSON.stringify([rules.version, productText, painText, plan])).digest('hex');
  return { root, product, pains, plan, hash };
}
function scaffold(ctx: ReturnType<typeof inputs>) {
  const { product: p, pains, plan, hash } = ctx;
  const top = pains.map((pain, index) => ({ pain, index })).sort((a, b) => b.pain.mentionCount - a.pain.mentionCount).slice(0, 3);
  const contents = [
    `${excerpt(p.name, 10)}: ${p.oneLiner} For ${excerpt(p.audience, 25)}. Problem: ${excerpt(p.problem, 40)} [product.json](product.json)`,
    `Audience: ${excerpt(p.audience, 25)} [product.json](product.json)\n\n` + (top.length ? top.map(({ pain, index }) => `- ${pain.name}: ${excerpt(pain.description, 15)} [pain:${index}](research/pains.json#/pains/${index})\n` + pain.quotes.map(q => `  - “${q.text}” [quote](${q.url})`).join('\n')).join('\n') : 'Pain research unavailable; no validated pains supplied.'),
    `One-liner: ${p.oneLiner} [product.json](product.json)\n\n` + [1, 2, 3].map(n => `- Tagline ${n}: Pending agent wording grounded in product.json.`).join('\n'),
    [p.oneLiner, `For ${excerpt(p.audience, 25)}.`, excerpt(p.problem, 40)].map(s => `- ${s} [product.json](product.json)`).join('\n'),
    budgetEntries(p.proofPoints.map((s, i) => ({ prefix: '-', text: s, suffix: `[product.json](product.json#/proofPoints/${i})` })), rules.sections[4].words - 20),
    budgetEntries(p.features.map((f, i) => ({ prefix: `- ${f.name}:`, text: f.description, suffix: `[feature:${i}](product.json#/features/${i}) — Pain mapping unverified.` })), rules.sections[5].words - 20),
    'No verified competitor claims available.',
    '- Is this suitable for our workflow? Review the sourced features; suitability requires human evaluation.',
    ['Who is this for?', 'What problem does it address?', 'What does it do?', 'Where is the evidence?', 'What does it cost?', 'Is there a free tier?', 'How do I get started?', 'What remains unverified?'].map((q, i) => `### ${i + 1}. ${q}\n${i === 0 ? excerpt(p.audience, 25) : i === 1 ? excerpt(p.problem, 40) : 'Pending agent answer from verified sources; do not invent details.'} [product.json](product.json)`).join('\n\n'),
    'Pricing and free-tier details unverified. Agent must inspect authoritative pricing sources before making promises.',
    words(plan) <= rules.sections[10].words - 20 ? plan.replace(/^#{1,6} /gm, '') : `Plan excerpt (review full dates and checklist in plan.md):\n\n${excerpt(plan.replace(/^#{1,6} /gm, ''), rules.sections[10].words - 40)}\n\n[Full launch plan](plan.md)`,
    ['08:00 — Verify assets and approvals.', '09:00 — Review scheduled channel times in plan.md.', '10:00 — Human launches approved channels at their planned times.', '11:00 — Monitor feedback.', '12:00 — Review questions.', '13:00 — Record issues.', '14:00 — Review replies with human.', '15:00 — Check links.', '16:00 — Capture initial metrics.', '17:00 — Record follow-ups.'].join('\n\n'),
    'Targets pending human agreement. Track visits, activation and qualified feedback; no baseline or outcome is assumed.',
    'Unverified pricing, competitor research and feature-to-pain mapping require agent and human review. This deterministic scaffold is not approved launch copy.'
  ];
  const markdown = `<!-- liftoff-brief-v${rules.version} inputs:${hash} -->\n# Launch Brief: ${p.name}\n\n` + rules.sections.map((s, i) => `## ${s.title}\n\n${contents[i]}\n`).join('\n');
  return markdown.split('\n').map(line => {
    if (/^#{1,2} |^<!--/.test(line)) return line;
    p.features.forEach((f, i) => { if (line.toLowerCase().includes(f.name.toLowerCase()) && !line.includes(`[feature:${i}](`)) line += ` [feature:${i}](product.json#/features/${i})`; });
    pains.forEach((pain, i) => { if (line.toLowerCase().includes(pain.name.toLowerCase()) && !line.includes(`[pain:${i}](`)) line += ` [pain:${i}](research/pains.json#/pains/${i})`; });
    return line;
  }).join('\n');
}
export function validateBrief(cwd: string, file?: string) {
  const ctx = inputs(cwd);
  const path = file ? resolve(cwd, file) : join(ctx.root, 'brief.md');
  return validateText(ctx, path, readFileSync(path, 'utf8'));
}
function validateText(ctx: ReturnType<typeof inputs>, path: string, text: string) {
  const errors: string[] = [], warnings: string[] = [];
  if (!text.includes(`inputs:${ctx.hash} -->`)) warnings.push('stale-brief: inputs changed or fingerprint missing; review and regenerate with brief --force');
  if (!ctx.pains.length) warnings.push('Pain research unavailable: pains.json missing or empty');
  const headings = [...text.matchAll(/^## (.+)$/gm)];
  if (headings.map(h => h[1]).join('|') !== rules.sections.map(s => s.title).join('|')) errors.push('Sections must be present exactly once in the fixed order');
  const bodies = rules.sections.map(section => {
    const h = headings.find(h => h[1] === section.title);
    if (!h) return '';
    const start = h.index! + h[0].length;
    const end = text.indexOf('\n## ', start);
    const body = text.slice(start, end < 0 ? undefined : end);
    if (!body.trim()) errors.push(`${section.title}: section is empty`);
    if (words(body) > section.words) errors.push(`${section.title}: exceeds ${section.words} word limit`);
    return body;
  });
  if ((bodies[2].match(/^- Tagline \d+:/gm) ?? []).length !== 3) errors.push('Exactly 3 alternative taglines required');
  if ((bodies[3].match(/^- /gm) ?? []).length !== 3) errors.push('Exactly 3 key messages required');
  const faq = (bodies[8].match(/^### /gm) ?? []).length;
  if (faq < rules.faqMin || faq > rules.faqMax) errors.push('FAQ requires 8–12 entries');
  for (const [group, values, pattern] of [
    ['feature', ctx.product.features, /\[feature:(\d+)\]\(product\.json#\/features\/(\d+)\)/g],
    ['pain', ctx.pains, /\[pain:(\d+)\]\(research\/pains\.json#\/pains\/(\d+)\)/g]
  ] as const) {
    for (const match of text.matchAll(pattern)) if (match[1] !== match[2] || !values[Number(match[1])]) errors.push(`Unknown ${group} citation: ${match[0]}`);
    for (const [index, value] of values.entries()) for (const line of text.split('\n')) {
      if (/^#{1,2} /.test(line)) continue;
      if (line.toLowerCase().includes(value.name.toLowerCase()) && !line.includes(`[${group}:${index}](`)) errors.push(`${group} ${value.name} requires an indexed ${group} citation on the same line`);
    }
  }
  for (const [i] of ctx.product.features.entries()) if (!bodies[5].includes(`[feature:${i}](product.json#/features/${i})`)) errors.push(`Feature map missing feature:${i}`);
  for (const line of bodies[6].split('\n').filter(l => l.trim() && l.trim() !== 'No verified competitor claims available.')) {
    if (![...line.matchAll(/https?:\/\/[^\s)]+/g)].some(m => url(m[0]))) errors.push('Every competitor claim requires an HTTP(S) URL on the same line');
  }
  return { kind: 'brief', path, valid: !errors.length, errors: [...new Set(errors)], warnings };
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function brief(cwd: string, force = false) {
  const ctx = inputs(cwd);
  const path = join(ctx.root, 'brief.md');
  const previous = existsSync(path) ? validateBrief(cwd).warnings : [];
  const regenerate = !existsSync(path) || force;
  const markdown = regenerate ? scaffold(ctx) : readFileSync(path, 'utf8');
  const result = validateText(ctx, path, markdown);
  if (!result.valid) throw new Error(result.errors.join('; '));
  if (regenerate) writeFileSync(path, markdown);
  const html = join(ctx.root, 'brief.html');
  const body = markdown.split('\n').filter(l => !l.startsWith('<!--')).map(l => {
    const heading = /^(#{1,3}) (.*)/.exec(l);
    const content = escape(heading ? heading[2] : l).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => /^(https?:|product\.json|research\/pains\.json)/.test(href) ? `<a href="${href}">${label}</a>` : label);
    return heading ? `<h${heading[1].length}>${content}</h${heading[1].length}>` : `<p>${content}</p>`;
  }).join('\n');
  writeFileSync(html, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Launch Brief</title><style>body{max-width:900px;margin:3rem auto;font:16px/1.5 system-ui;padding:1rem;color:#182030}h2{border-bottom:1px solid #ccc}p{white-space:pre-wrap}a{color:#164a98}@media print{body{margin:0;max-width:none;font-size:11pt}h2,h3{break-after:avoid}a{color:inherit}p{orphans:3;widows:3}}</style><body>${body}</body></html>`);
  return { path, html, warnings: [...new Set([...previous, ...result.warnings])], scaffold: true };
}
