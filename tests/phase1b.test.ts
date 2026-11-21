import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { brief, validateBrief } from '../src/brief/index.js';
import { checks } from '../src/selftest/phase1b.js';
import { packageRoot } from '../src/core/package-root.js';
import { checks as researchChecks } from '../src/selftest/phase0.js';
import { checkResearch } from '../src/research/index.js';

let cwd: string;
beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'liftoff-brief-test-')); });
afterEach(() => rmSync(cwd, { recursive: true, force: true }));
function setup(fixture = 'cli-tool') {
  cpSync(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
  mkdirSync(join(cwd, '.launch/research'), { recursive: true });
  cpSync(join(cwd, '.liftoff-fixture/product.json'), join(cwd, '.launch/product.json'));
  writeFileSync(join(cwd, '.launch/plan.md'), '# Plan\n\n2026-02-10 09:00 UTC — launch on approved channels.');
}
function edit(transform: (text: string) => string) {
  const path = join(cwd, '.launch/brief.md');
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}
describe('phase 1b Launch Brief', () => {
  it('consumes Phase 0 output without replacing its verified pain evidence', async () => {
    setup();
    await researchChecks[0].run({ cwd, fixture: 'cli-tool' });
    const path = join(cwd, '.launch/research/pains.json');
    const original = readFileSync(path, 'utf8');
    expect(JSON.parse(original)).toEqual(JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8')));
    await checks[0].run({ cwd, fixture: 'cli-tool' });
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(await checkResearch(cwd)).toMatchObject({ valid: true, errors: [] });
    expect(validateBrief(cwd).valid).toBe(true);
  });
  it('ranks the shared pain shape by mentions then intensity and enforces quote constraints', () => {
    setup();
    const path = join(cwd, '.launch/research/pains.json');
    const data = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    data.pains[1].mentions = 10;
    data.pains[2].mentions = 10;
    data.pains[2].intensity = 5;
    writeFileSync(path, JSON.stringify(data));
    const result = brief(cwd);
    const section = readFileSync(result.path, 'utf8').split('## Target users and top pains\n')[1].split('\n## ')[0];
    expect(section.indexOf('- Unclear approvals:')).toBeLessThan(section.indexOf('- Lost drafts:'));
    expect(section.indexOf('- Lost drafts:')).toBeLessThan(section.indexOf('- Manual scheduling:'));
    data.pains[0].quotes[0].text = 'word '.repeat(26);
    writeFileSync(path, JSON.stringify(data));
    expect(() => brief(cwd, true)).toThrow('quote exceeds 25 words');
    data.pains[0].quotes[0].text = 'A short quote.';
    data.pains[0].quotes[0].url = 'http://example.com/research';
    writeFileSync(path, JSON.stringify(data));
    expect(() => brief(cwd, true)).toThrow('Invalid pains[]');
  });
  it('preserves literal list markers in direct quotes while collapsing whitespace only', () => {
    setup();
    const pains = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    pains.pains[0].quotes[0].text = '* * * * * cron runs\n- keep literal markers';
    pains.pains[0].quotes[1].text = '1. First attempt\n+ second attempt';
    const painPath = join(cwd, '.launch/research/pains.json');
    const source = JSON.stringify(pains);
    writeFileSync(painPath, source);
    const result = brief(cwd);
    const markdown = readFileSync(result.path, 'utf8');
    expect(markdown).toContain('  - “* * * * * cron runs - keep literal markers” [quote]');
    expect(markdown).toContain('  - “1. First attempt + second attempt” [quote]');
    const section = markdown.split('## Target users and top pains\n')[1].split('\n## ')[0];
    expect(section.match(/^- /gm)).toHaveLength(3);
    expect(validateBrief(cwd).valid).toBe(true);
    expect(readFileSync(painPath, 'utf8')).toBe(source);
  });
  it('matches feature and pain names regardless of case or whitespace on either side', () => {
    setup();
    const productPath = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(productPath, 'utf8'));
    product.features[0].name = 'Fast Sync';
    writeFileSync(productPath, JSON.stringify(product));
    const pains = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    pains.pains[0].name = 'Setup   friction';
    writeFileSync(join(cwd, '.launch/research/pains.json'), JSON.stringify(pains));
    const line = '- Review fAsT  \tSyNc and SETUP\t friction.';
    writeFileSync(join(cwd, '.launch/plan.md'), line);
    const result = brief(cwd);
    const original = readFileSync(result.path, 'utf8');
    expect(original).toContain(`${line} [feature:0](product.json#/features/0) [pain:0](research/pains.json#/pains/0)`);
    expect(validateBrief(cwd).valid).toBe(true);
    for (const [group, citation] of [['feature', '[feature:0](product.json#/features/0)'], ['pain', '[pain:0](research/pains.json#/pains/0)']]) {
      writeFileSync(result.path, original.split('\n').map(text => text.startsWith(line) ? text.replace(` ${citation}`, '') : text).join('\n'));
      expect(validateBrief(cwd).errors.join()).toContain(`requires an indexed ${group} citation`);
    }
  });
  it('budgets citations added to flattened plan headings at the section limit', () => {
    setup();
    const productPath = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(productPath, 'utf8'));
    product.features = ['FeatureA', 'FeatureB', 'FeatureC'].map(name => ({ ...product.features[0], name }));
    writeFileSync(productPath, JSON.stringify(product));
    const plan = '## FeatureA FeatureB FeatureC\n'.repeat(20) + 'schedule '.repeat(720);
    expect(plan.trim().split(/\s+/)).toHaveLength(800);
    writeFileSync(join(cwd, '.launch/plan.md'), plan);
    const result = brief(cwd);
    expect(validateBrief(cwd).valid).toBe(true);
    const section = readFileSync(result.path, 'utf8').split('## Channel plan with dates\n')[1].split('\n## ')[0];
    expect(section.trim().split(/\s+/).length).toBeLessThanOrEqual(800);
    expect(section).toContain('[Full launch plan](plan.md)');
    expect(section).toContain('…');
    for (let i = 0; i < 3; i++) expect(section).toContain(`[feature:${i}](product.json#/features/${i})`);
  });
  it('normalizes multiline free text in every inline scaffold insertion', () => {
    setup();
    const productPath = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(productPath, 'utf8'));
    product.name = '- Tasklight\n+ Portable';
    product.oneLiner = '- Local tasks\n* Simple workflow';
    product.audience = '- Developers\n- Small teams';
    product.problem = '1. Complex setup\n2. Scattered guidance';
    product.proofPoints[0] = '* Repository evidence\n+ Working interface';
    product.features[0].name = '- Local\n- tasks';
    product.features[0].description = '- Add tasks\n- Track progress';
    writeFileSync(productPath, JSON.stringify(product));
    const pains = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    pains.pains[0].name = '- Setup\n- friction';
    pains.pains[0].description = '- Too many steps\n- Poor guidance';
    pains.pains[0].quotes[0].text = '- Setup is slow\n- Guidance is unclear';
    writeFileSync(join(cwd, '.launch/research/pains.json'), JSON.stringify(pains));
    const result = brief(cwd);
    const markdown = readFileSync(result.path, 'utf8');
    expect(validateBrief(cwd).valid).toBe(true);
    for (const text of ['Tasklight Portable', 'Local tasks Simple workflow', 'Developers Small teams', 'Complex setup Scattered guidance', 'Repository evidence Working interface', 'Local tasks: Add tasks Track progress', 'Setup friction: Too many steps Poor guidance', '“- Setup is slow - Guidance is unclear”']) expect(markdown).toContain(text);
    const messages = markdown.split('## Key messages\n')[1].split('\n## ')[0];
    expect(messages.match(/^- /gm)).toHaveLength(3);
    edit(s => s.replace('## Open risks', '## Open risks\nLocal tasks are available.'));
    expect(validateBrief(cwd).errors.join()).toContain('requires an indexed feature citation');
  });
  it('keeps full input wording when sections fit and marks omissions when they do not', () => {
    setup();
    const productPath = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(productPath, 'utf8'));
    product.audience = 'developers '.repeat(30).trim();
    product.problem = 'workflow '.repeat(45).trim();
    product.proofPoints[0] = 'documented '.repeat(150).trim();
    product.features[0].description = 'supported '.repeat(100).trim();
    writeFileSync(productPath, JSON.stringify(product));
    const result = brief(cwd);
    const full = readFileSync(result.path, 'utf8');
    const positioning = full.split('## Positioning statement')[1].split('\n## ')[0];
    expect(positioning).toContain(product.audience);
    expect(positioning).toContain(product.problem);
    expect(full).toContain(product.proofPoints[0]);
    expect(full).toContain(product.features[0].description);
    expect(full).not.toContain('…');
    product.audience = 'developers '.repeat(1000).trim();
    product.problem = 'workflow '.repeat(1000).trim();
    product.proofPoints[0] = 'documented '.repeat(1000).trim();
    product.features[0].description = 'supported '.repeat(1000).trim();
    writeFileSync(productPath, JSON.stringify(product));
    writeFileSync(join(cwd, '.launch/plan.md'), 'Launch schedule. '.repeat(1000));
    brief(cwd, true);
    const shortened = readFileSync(result.path, 'utf8');
    for (const title of ['Positioning statement', 'Target users and top pains', 'Key messages', 'Proof points with sources', 'Feature-to-pain map', 'FAQ', 'Channel plan with dates']) {
      expect(shortened.split(`## ${title}\n`)[1].split('\n## ')[0]).toContain('…');
    }
    expect(shortened).toContain('… [Full text in product.json](product.json)');
    expect(validateBrief(cwd).valid).toBe(true);
  });
  it('renders the full plan and safe local citations without enabling unsafe links', () => {
    setup();
    writeFileSync(join(cwd, '.launch/plan.md'), 'Review launch dates. '.repeat(400));
    const result = brief(cwd);
    edit(s => s.replace('Targets pending', '[notes](research/notes.md) [unsafe](javascript:alert) [outside](../secret.md) [absolute](/etc/passwd) [protocol](//evil.example) [encoded](%2e%2e/secret.md) [other](data:text/plain,hello) Targets pending'));
    brief(cwd);
    const html = readFileSync(result.html, 'utf8');
    expect(html).toContain('<a href="plan.md">Full launch plan</a>');
    expect(html).toContain('<a href="research/notes.md">notes</a>');
    for (const unsafe of ['javascript:', '../secret.md', '/etc/passwd', '//evil.example', '%2e%2e', 'data:']) expect(html).not.toContain(`href="${unsafe}`);
  });
  it('requires citations in FAQ questions and adds them to generated questions', () => {
    setup();
    const productPath = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(productPath, 'utf8'));
    product.features[0].name = 'evidence';
    writeFileSync(productPath, JSON.stringify(product));
    const pains = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    pains.pains[0].name = 'problem';
    writeFileSync(join(cwd, '.launch/research/pains.json'), JSON.stringify(pains));
    const result = brief(cwd);
    const original = readFileSync(result.path, 'utf8');
    expect(original).toContain('### 4. Where is the evidence? [feature:0]');
    expect(original).toContain('### 2. What problem does it address? [pain:0]');
    for (const marker of ['feature', 'pain']) {
      writeFileSync(result.path, original.replace(/^(### .*?) \[(feature|pain):0\]\([^\n]+\)/gm, (line, question, group) => group === marker ? question : line));
      expect(validateBrief(cwd).errors.join()).toContain(`requires an indexed ${marker} citation`);
    }
  });
  it('budgets verbose feature descriptions, proof points, audience, problem and plan', () => {
    setup();
    const path = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(path, 'utf8'));
    product.features = Array.from({ length: 8 }, (_, i) => ({ ...product.features[0], name: `Capability-${i}`, description: 'Detailed supported behavior. '.repeat(400) }));
    product.proofPoints = Array.from({ length: 5 }, () => 'Evidence from the repository. '.repeat(400));
    product.audience = 'Developers seeking simple workflows. '.repeat(400);
    product.problem = 'Difficult setup and scattered guidance. '.repeat(400);
    writeFileSync(path, JSON.stringify(product));
    writeFileSync(join(cwd, '.launch/plan.md'), '2026-02-10 09:00 UTC — Review approved launch channels. '.repeat(400));
    const result = brief(cwd);
    expect(validateBrief(cwd).valid).toBe(true);
    const markdown = readFileSync(result.path, 'utf8');
    product.features.forEach((feature: { name: string }, i: number) => {
      expect(markdown).toContain(feature.name);
      expect(markdown).toContain(`[feature:${i}](product.json#/features/${i})`);
    });
    expect(markdown).toContain('[Full launch plan](plan.md)');
  });
  it('allows feature and pain names in fixed headings without heading citations', () => {
    setup();
    const path = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(path, 'utf8'));
    product.features[0].name = 'FAQ';
    writeFileSync(path, JSON.stringify(product));
    const pains = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    pains.pains[0].name = 'Positioning statement';
    writeFileSync(join(cwd, '.launch/research/pains.json'), JSON.stringify(pains));
    const result = brief(cwd);
    expect(validateBrief(cwd).valid).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain('\n## FAQ\n');
    edit(s => s.replace('## Open risks', '## Open risks\nFAQ has an uncited mention.'));
    expect(validateBrief(cwd).errors.join()).toContain('requires an indexed feature citation');
  });
  it('preserves edited Markdown and HTML when forced regeneration fails', () => {
    setup();
    const result = brief(cwd);
    edit(s => s.replace('Targets pending', 'Human-reviewed targets pending'));
    const before = readFileSync(result.path, 'utf8');
    const html = readFileSync(result.html, 'utf8');
    const path = join(cwd, '.launch/product.json');
    const product = JSON.parse(readFileSync(path, 'utf8'));
    product.features[0].name = 'Unreasonably verbose name '.repeat(700);
    writeFileSync(path, JSON.stringify(product));
    expect(() => brief(cwd, true)).toThrow();
    expect(readFileSync(result.path, 'utf8')).toBe(before);
    expect(readFileSync(result.html, 'utf8')).toBe(html);
  });
  it.each(['cli-tool', 'saas-next', 'mobile-expo'])('passes positive and negative gate for %s', async fixture => {
    setup(fixture);
    await checks[0].run({ cwd, fixture });
    expect(validateBrief(cwd)).toMatchObject({ valid: true, warnings: [] });
    const html = readFileSync(join(cwd, '.launch/brief.html'), 'utf8');
    expect(html).toContain('@media print');
    expect(html).not.toContain('<script');
  });
  it('warns for absent research, preserves edits, and rejects empty Phase 0 research', () => {
    setup();
    expect(brief(cwd).warnings.join()).toContain('Pain research unavailable');
    edit(s => s.replace('Pending agent wording', 'Reviewed wording'));
    const before = readFileSync(join(cwd, '.launch/brief.md'), 'utf8');
    brief(cwd);
    expect(readFileSync(join(cwd, '.launch/brief.md'), 'utf8')).toBe(before);
    writeFileSync(join(cwd, '.launch/research/pains.json'), '{"idea":"Launch planning","pains":[],"competitors":[]}');
    expect(() => validateBrief(cwd)).toThrow('Invalid pains[]');
    expect(() => brief(cwd, true)).toThrow('Invalid pains[]');
    expect(readFileSync(join(cwd, '.launch/brief.md'), 'utf8')).toBe(before);
  });
  it('rejects missing inputs, malformed JSON and malformed research', () => {
    expect(() => brief(cwd)).toThrow();
    setup();
    writeFileSync(join(cwd, '.launch/research/pains.json'), '{}');
    expect(() => brief(cwd)).toThrow('pains[]');
    writeFileSync(join(cwd, '.launch/research/pains.json'), '{"pains":[{}]}');
    expect(() => brief(cwd)).toThrow();
    writeFileSync(join(cwd, '.launch/product.json'), '{');
    expect(() => brief(cwd)).toThrow();
  });
  it.each([
    (s: string) => s.replace('## Key messages', '## Missing messages'),
    (s: string) => s.replace('- Tagline 3:', 'Tagline 3:'),
    (s: string) => s.replace('### 8.', '8.'),
    (s: string) => s.replaceAll('[feature:0](product.json#/features/0)', '[feature:99](product.json#/features/99)'),
    (s: string) => s.replaceAll('[pain:0](research/pains.json#/pains/0)', '[pain:99](research/pains.json#/pains/99)'),
  ])('rejects structural and grounding errors', transform => {
    setup();
    cpSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), join(cwd, '.launch/research/pains.json'));
    brief(cwd);
    edit(transform);
    expect(validateBrief(cwd).valid).toBe(false);
  });
  it('escapes unsafe markup in HTML and supports JSON command failures', () => {
    setup();
    brief(cwd);
    edit(s => s.replace('Targets pending', '<script>alert(1)</script> Targets pending'));
    const result = brief(cwd);
    expect(readFileSync(result.html, 'utf8')).toContain('&lt;script&gt;');
    const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), '--cwd', cwd, ...args, '--json'], { encoding: 'utf8' });
    expect(JSON.parse(cli('brief').stdout).ok).toBe(true);
    edit(s => s.replace('No verified competitor claims available.', 'Unsupported claim'));
    const failed = cli('validate', 'brief');
    expect(failed.status).not.toBe(0);
    expect(JSON.parse(failed.stdout).ok).toBe(false);
  });
});
