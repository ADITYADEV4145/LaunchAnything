import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import type { Config } from '../product/init.js';
import { checked, readJson, writeLocal } from '../results/files.js';
import { commitNotes, commits, git, root, slug } from './common.js';
import { makeKit, openReleasePr } from './release-kit.js';

export function releaseSince(now: Date, cadence: string) {
  const since = new Date(now);
  if (cadence === 'weekly') since.setUTCDate(since.getUTCDate() - 7);
  else {
    const day = since.getUTCDate();
    since.setUTCDate(1);
    since.setUTCMonth(since.getUTCMonth() - 1);
    const lastDay = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + 1, 0)).getUTCDate();
    since.setUTCDate(Math.min(day, lastDay));
  }
  return since;
}

export async function release(cwd: string, options: { from?: string; to?: string; type?: string; cadence?: string; now?: Date; issues?: string; shots?: boolean; draft?: boolean; openPr?: boolean } = {}) {
  if (options.openPr && !options.draft) throw new Error('--open-pr requires --draft');
  const type = options.type ?? 'changelog';
  if (!['feature', 'changelog'].includes(type)) throw new Error('--type must be feature or changelog');
  if (options.cadence && !['weekly', 'monthly'].includes(options.cadence)) throw new Error('--cadence must be weekly or monthly');
  if (options.cadence && options.from) throw new Error('Choose --from or --cadence, not both');
  const to = options.to ?? 'HEAD';
  const target = git(cwd, 'rev-parse', '--verify', '--end-of-options', `${to}^{commit}`);
  let from = options.from;
  if (!from && !options.cadence) {
    let tagged = false;
    try { git(cwd, 'describe', '--tags', '--exact-match', target); tagged = true; } catch { /* Between tags. */ }
    from = git(cwd, 'describe', '--tags', '--abbrev=0', tagged ? `${target}^` : target);
  }
  const base = from ? git(cwd, 'rev-parse', '--verify', '--end-of-options', `${from}^{commit}`) : undefined;
  const now = options.now ?? new Date();
  const since = releaseSince(now, options.cadence ?? 'monthly');
  const rows = commits(cwd, base ? [`${base}..${target}`] : [target, `--since=${since.toISOString()}`, `--until=${now.toISOString()}`]);
  if (!rows.length) throw new Error('No commits in release range');
  const config = checked<Config>('config', await readJson(launchDir(cwd).config));
  const channels = type === 'feature' ? ['github-release', 'blog', 'x'] : ['github-release', 'blog'];
  const plan = ['# Small release launch plan', '', `Type: ${type} | Timezone: ${config.timezone}`, '',
    ...channels.map(channel => {
      const rule = loadRule('channels', channel);
      return `- [ ] ${channel}: prepare a concise, source-linked ${type} draft. Suggested window: ${(rule.bestPostingTimes as string[]).join(', ')} (${config.timezone}); check channel rules before sharing.`;
    }), '', 'Human review and approval required. Paste or publish manually; nothing is sent.', ''].join('\n');
  let label: string;
  try { label = git(cwd, 'describe', '--tags', '--exact-match', target); }
  catch { label = git(cwd, 'rev-parse', '--short', target); }
  const folder = join(root(cwd), 'releases', slug(label));
  const notes = join(folder, 'notes.md'), planPath = join(folder, 'plan.md');
  await writeLocal(notes, `# ${type} release\n\nRange: ${base ?? since.toISOString()}..${target}\n\n${commitNotes(rows)}`);
  await writeLocal(planPath, plan);
  const kit = await makeKit(cwd, folder, target, base, config, options, base ? undefined : [target, `--since=${since.toISOString()}`, `--until=${now.toISOString()}`]);
  const branch = options.openPr ? openReleasePr(cwd, folder, kit.historyPath, slug(label), (await readJson(kit.kit) as { files: string[] }).files) : undefined;
  return { notes, plan: planPath, from: base, to: target, commits: rows.length, ...kit, branch };
}
