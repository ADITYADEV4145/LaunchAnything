import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { brief, validateBrief } from '../src/brief/index.js';
import { checks } from '../src/selftest/phase1b.js';
import { packageRoot } from '../src/core/package-root.js';

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
  it.each(['cli-tool', 'saas-next', 'mobile-expo'])('passes positive and negative gate for %s', async fixture => {
    setup(fixture);
    await checks[0].run({ cwd, fixture });
    expect(validateBrief(cwd)).toMatchObject({ valid: true, warnings: [] });
    const html = readFileSync(join(cwd, '.launch/brief.html'), 'utf8');
    expect(html).toContain('@media print');
    expect(html).not.toContain('<script');
  });
  it('warns for absent or empty pains and preserves agent edits on rerun', () => {
    setup();
    expect(brief(cwd).warnings.join()).toContain('Pain research unavailable');
    edit(s => s.replace('Pending agent wording', 'Reviewed wording'));
    const before = readFileSync(join(cwd, '.launch/brief.md'), 'utf8');
    brief(cwd);
    expect(readFileSync(join(cwd, '.launch/brief.md'), 'utf8')).toBe(before);
    writeFileSync(join(cwd, '.launch/research/pains.json'), '{"pains":[]}');
    expect(validateBrief(cwd).warnings.join()).toContain('stale-brief');
    expect(brief(cwd, true).warnings.join()).toContain('Pain research unavailable');
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
