import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, prepare, review } from '../audience/index.js';
import { exportSignups, importSignups } from '../audience/waitlist.js';
import { packageRoot } from '../core/package-root.js';
import type { Check } from './types.js';

export const checks: Check[] = [{
  name: 'sourced audience drafts, hash review and local consented Kit export',
  async run({ cwd }) {
    const prepared = await prepare(cwd);
    const drafts = await review(cwd);
    const outreach = drafts.find(d => d.kind === 'outreach');
    const build = drafts.find(d => d.kind === 'build-in-public');
    if (!outreach?.blocked || outreach.target !== 'https://news.ycombinator.com/' || !build || build.approved)
      throw new Error('Expected evidence-backed HN outreach and unapproved build-in-public drafts');
    await approve(cwd, build.id, build.sha256, 'Fixture reviewer');
    if (!(await review(cwd)).find(d => d.id === build.id)?.approved) throw new Error('Exact draft approval was not saved');
    const file = prepared.drafts.find(d => d.id === build.id)!.path;
    const original = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, original + '\n');
      await prepare(cwd);
      if ((await review(cwd)).find(d => d.id === build.id)?.approved) throw new Error('Editing did not invalidate approval');
    } finally { writeFileSync(file, original); }
    const source = join(cwd, '.launch/audience/fixture-signups.json');
    copyFileSync(join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/phase0b-signups.json'), source);
    if (importSignups(cwd, source).imported !== 1) throw new Error('Duplicate signup was not merged');
    const exported = exportSignups(cwd);
    if (exported.total !== 1 || readFileSync(exported.path, 'utf8') !== 'Email\r\n"reader@example.test"\r\n')
      throw new Error('Invalid local Kit CSV');
  },
}];
