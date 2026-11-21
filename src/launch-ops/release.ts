import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import type { Config } from '../product/init.js';
import { checked, readJson, writeLocal } from '../results/files.js';
import { commitNotes, commits, git, root, slug } from './common.js';

export async function release(cwd: string, options: { from?: string; to?: string; type?: string; cadence?: string; now?: Date } = {}) {
  const type = options.type ?? 'changelog';
  if (!['feature', 'changelog'].includes(type)) throw new Error('--type must be feature or changelog');
  if (options.cadence && !['weekly', 'monthly'].includes(options.cadence)) throw new Error('--cadence must be weekly or monthly');
  if (options.cadence && options.from) throw new Error('Choose --from or --cadence, not both');
  const to = options.to ?? 'HEAD';
  const target = git(cwd, 'rev-parse', '--verify', '--end-of-options', `${to}^{commit}`);
  let from = options.from;
  if (!from && !options.cadence) from = git(cwd, 'describe', '--tags', '--abbrev=0', target);
  const base = from ? git(cwd, 'rev-parse', '--verify', '--end-of-options', `${from}^{commit}`) : undefined;
  const now = options.now ?? new Date();
  const since = new Date(now);
  if (options.cadence === 'weekly') since.setUTCDate(since.getUTCDate() - 7);
  else since.setUTCMonth(since.getUTCMonth() - 1);
  const rows = commits(cwd, base ? [`${base}..${target}`] : [target, `--since=${since.toISOString()}`, `--until=${now.toISOString()}`]);
  if (!rows.length) throw new Error('No commits in release range');
  const config = checked<Config>('config', await readJson(launchDir(cwd).config));
  const channels = type === 'feature' ? ['github-release', 'blog', 'x'] : ['github-release', 'blog'];
  const plan = ['# Small release launch plan', '', `Type: ${type} | Timezone: ${config.timezone}`, '',
    ...channels.map(channel => {
      const rule = loadRule('channels', channel);
      return `- [ ] ${channel}: prepare a concise, source-linked ${type} draft. Suggested window: ${(rule.bestPostingTimes as string[]).join(', ')} (${config.timezone}); check channel rules before sharing.`;
    }), '', 'Human review and approval required. Paste or publish manually; nothing is sent.', ''].join('\n');
  const folder = join(root(cwd), 'releases', slug(to));
  const notes = join(folder, 'notes.md'), planPath = join(folder, 'plan.md');
  await writeLocal(notes, `# ${type} release\n\nRange: ${base ?? since.toISOString()}..${target}\n\n${commitNotes(rows)}`);
  await writeLocal(planPath, plan);
  return { notes, plan: planPath, from: base, to: target, commits: rows.length };
}
