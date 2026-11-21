import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { friends } from '../launch-ops/friends.js';
import { followup } from '../launch-ops/followup.js';
import { release } from '../launch-ops/release.js';
import { warroom } from '../launch-ops/warroom.js';
import { git } from '../launch-ops/common.js';
import { collect } from '../results/collect.js';
import { readJson, writeJson, writeLocal } from '../results/files.js';
import { retro } from '../results/retro.js';
import type { Check } from './types.js';

export const checks: Check[] = [{
  name: 'launch operations draft locally, track approvals and extend results without network',
  async run({ cwd }) {
    const fixture = join(cwd, '.liftoff-fixture');
    const workspace = join(fixture, 'launchops-work'), paths = launchDir(workspace);
    const { profile } = await readJson(join(fixture, 'expected.json')) as { profile: string };
    await writeJson(paths.config, { profile, launchType: 'new-product', channels: ['x', 'blog', 'github-release'], launchDate: '2026-01-01', timezone: 'UTC', profileConfirmed: true });
    await writeJson(paths.product, await readJson(join(fixture, 'product.json')));
    await writeJson(paths.published, { posts: [{ channel: 'x', id: 'live', status: 'published', url: 'https://example.test/launch' }] });
    const readStatus = async () => ({ owned: true, metrics: { views: 12 }, comments: [{ id: 'reader', author: 'Reader', body: 'Can I try it?', answered: false }] });
    assert.equal((await warroom(workspace, { readStatus })).newComments, 1);
    assert.equal((await warroom(workspace, { readStatus, approve: 'reader', by: 'Reviewer' })).newComments, 0);
    assert.match(await readFile(join(paths.root, 'warroom.md'), 'utf8'), /READY/);
    await writeJson(join(paths.root, 'friends.json'), { people: [{ name: 'Reader', route: 'personal message', optedIn: true }, { name: 'Skipped', route: 'email' }] });
    assert.deepEqual((await friends(workspace)).skipped, ['Skipped']);
    assert.equal((await friends(workspace, { check: true })).checked, 1);
    await collect(workspace, { now: new Date('2026-01-09T12:00:00Z'), readStatus });
    await writeLocal(join(paths.root, 'brief.md'), '## Success metrics\n- views: 10\n- signups: 5\n');
    const result = await retro(workspace, join(paths.root, 'history.json'));
    assert.equal(result.rows[0].status, 'met');
    assert.equal(result.rows[1].status, 'unreported');
    assert.equal((await followup(workspace)).paths.length, 4);
    const released = await release(workspace);
    assert.equal(released.commits, 1);
    assert.ok((await readFile(released.notes, 'utf8')).includes(git(workspace, 'rev-parse', 'HEAD')));
  },
}];
