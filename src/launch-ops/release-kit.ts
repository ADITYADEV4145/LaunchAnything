import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { inspectPost } from '../copy/check.js';
import { loadPlatform } from '../copy/platforms.js';
import type { Config } from '../product/init.js';
import { checked, readJson, writeJson, writeLocal } from '../results/files.js';
import { takeShots } from '../visuals/shots.js';
import { render, run } from '../video/render.js';
import { git, optionalText, root } from './common.js';

export interface Change { sha: string; title: string; body: string; files: string[]; issues: number[]; score: number; reasons: string[] }
export interface ClosedIssue { number: number; title: string; state?: string; html_url?: string; closed_at?: string | null; pull_request?: unknown }
export function cleanTitle(subject: string) {
  const title = subject.trim().replace(/^[a-z][a-z\d-]*(?:\([^)]*\))?!?:\s*/i, '').replace(/\s*\(#\d+\)$/, '').trim();
  return title.replace(/\p{L}/u, letter => letter.toUpperCase());
}
export function closedIssuesInRange(issues: ClosedIssue[], since: string, until: string) {
  const start = Date.parse(since), end = Date.parse(until);
  return issues.filter(issue => {
    const closed = issue.closed_at ? Date.parse(issue.closed_at) : NaN;
    return !('pull_request' in issue) && issue.state === 'closed' && closed >= start && closed <= end;
  });
}
export function clipScenes(ids: string[], changes: Pick<Change, 'title'>[]) {
  const texts = changes.flatMap(change => {
    const words = cleanTitle(change.title).split(/\s+/).filter(Boolean);
    return Array.from({ length: Math.ceil(words.length / 8) }, (_, i) => words.slice(i * 8, (i + 1) * 8).join(' '));
  });
  if (!ids.length || !texts.length) return [];
  return Array.from({ length: Math.max(6, texts.length) }, (_, i) => ({ shot: `shots/${ids[i % ids.length]}.png`, text: texts[i % texts.length], duration: 4.5 }));
}
export function judge(title: string, files: string[], issues: number[] = []) {
  const reasons: string[] = [];
  let score = 0;
  if (/^(feat|fix|perf)(\(|!|:)|BREAKING CHANGE/i.test(title)) { score += 4; reasons.push('Feature, fix, performance or breaking change'); }
  if (/^(docs|chore|test|ci|refactor|build)(\(|:)/i.test(title)) { reasons.push('Maintenance-only subject'); return { score: 0, reasons }; }
  if (files.some(f => !/^(tests?\/|docs?\/|\.github\/|\.launch\/)|\.(test|spec)\./.test(f) && !/\.md$/.test(f))) { score += 2; reasons.push('Touches user-facing implementation'); }
  if (issues.length) { score += 1; reasons.push('Linked closed issue'); }
  return { score, reasons };
}
export function technical(profile: string, changes: Pick<Change, 'files' | 'title'>[]) {
  return profile === 'devtool' || changes.some(c => /^perf/.test(c.title) || c.files.some(f => /(^|\/)(api|cli|src|bin)\/|\.[cm]?[jt]sx?$/.test(f)));
}
export function affected(shot: { sources?: string[]; commands?: string[]; route?: string }, files: string[]) {
  if (shot.sources) return shot.sources.some(glob => {
    const pattern = glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
    return files.some(file => new RegExp(`^${pattern}$`).test(file));
  });
  if (shot.commands) return files.some(f => /^(src\/|bin\/|package.json$)/.test(f));
  const route = (shot.route ?? '/').split('?')[0].replace(/^\/|\/$/g, '');
  return files.some(f => /(^|\/)(layout\.[^/]+|globals\.css)$|(^|\/)tailwind\.config\.|^package.json$/.test(f) ||
    ['app/', 'src/app/'].some(prefix => f.startsWith(`${prefix}${route ? route + '/' : ''}page.`)) ||
    ['pages/', 'src/pages/'].some(prefix => f.startsWith(`${prefix}${route || 'index'}.`) || f.startsWith(`${prefix}${route ? route + '/' : ''}index.`)));
}
export function relaunch(changes: Change[]) {
  const score = changes.reduce((sum, c) => sum + c.score, 0);
  const ph = changes.length >= 6 && score >= 30;
  const hn = ph && changes.some(c => /perf|architecture|algorithm/i.test(c.title + c.body) && /\d|https?:\/\//.test(c.title + c.body));
  return { ph, hn, score, text: `# Relaunch planner\n\nPH v2: ${ph ? 'Recommended for human review' : 'Not yet recommended'} (${changes.length}/6 user-facing changes; score ${score}/30).\n\nHN: ${hn ? 'New technical substance; review a technical submission' : 'Not recommended: requires PH threshold and a performance/architecture/algorithm change with a concrete number or writeup URL'}.\n` };
}
export function readChanges(cwd: string, range: string[]) : Change[] {
  return git(cwd, 'log', '--format=%H', ...range).split('\n').filter(Boolean).map(sha => {
    const title = git(cwd, 'show', '-s', '--format=%s', sha), body = git(cwd, 'show', '-s', '--format=%b', sha);
    const files = git(cwd, 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha).split('\n').filter(Boolean);
    const issues = [...(title + '\n' + body).matchAll(/(?:fix(?:es|ed)?|clos(?:es|ed)|resolv(?:es|ed))\s+#(\d+)/gi)].map(m => Number(m[1]));
    return { sha, title, body, files, issues, ...judge(title, files, issues) };
  });
}
export async function draftPosts(folder: string, channels: string[], changes: Change[], source: (c: Change) => string) {
  const verdicts: Record<string, unknown> = {};
  for (const channel of channels) {
    const rule = loadPlatform(channel);
    const intro = ({ x: 'Shipped:', linkedin: 'What changed for users:', email: 'An update for you:', devto: 'Implementation update:' } as Record<string, string>)[channel];
    const budget = Math.min(rule.postMax ?? rule.body.maxLength, rule.body.maxLength);
    const link = changes[0] && source(changes[0]).startsWith('https://') ? source(changes[0]) : '';
    let body = intro;
    for (const change of changes) {
      const title = cleanTitle(change.title);
      if ((body + '\n\n' + title + '\n\n' + link).length <= budget) body += '\n\n' + title;
    }
    if (!changes.length) body = 'No commits in this window.';
    if (link) body += '\n\n' + link;
    const title = 'Release update';
    const issues = inspectPost({ channel, title, body, media: [], claims: [] }, channel, { name: '', features: [], claims: [] });
    verdicts[channel] = { passed: !issues.length, issues };
    await writeLocal(join(folder, 'posts', `${channel}.md`), `# ${title}\n\n${body}\n\n<!-- Sources (review evidence, not post copy):\n${changes.map(c => `${c.title} (${c.sha}) — ${source(c)}`).join('\n')}\n-->\n`);
  }
  await writeJson(join(folder, 'copy-check.json'), verdicts);
}
export async function makeKit(cwd: string, folder: string, target: string, base: string | undefined, config: Config, options: { issues?: string; shots?: boolean }, range?: string[]) {
  await rm(join(folder, 'posts'), { recursive: true, force: true });
  await rm(join(folder, 'media'), { recursive: true, force: true });
  const changes = readChanges(cwd, range ?? (base ? [`${base}..${target}`] : [target]));
  const warnings: string[] = [];
  let issues: ClosedIssue[] = [];
  if (options.issues) {
    const data = await readJson(options.issues);
    if (!Array.isArray(data) || data.some(i => !Number.isInteger(i.number) || typeof i.title !== 'string')) throw new Error('--issues must contain an array of issues with number and title');
    issues = data;
  }
  let remote = ''; try { remote = git(cwd, 'remote', 'get-url', 'origin'); } catch { /* Offline repository. */ }
  const github = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
  if (!options.issues && process.env.GITHUB_TOKEN && github && base) {
    try {
      const since = git(cwd, 'show', '-s', '--format=%cI', base);
      const until = git(cwd, 'show', '-s', '--format=%cI', target);
      const response = await fetch(`https://api.github.com/repos/${github}/issues?state=closed&since=${encodeURIComponent(since)}&per_page=100`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      issues = closedIssuesInRange(await response.json() as ClosedIssue[], since, until);
    } catch { warnings.push('Closed issue fetch failed; using commit references only.'); }
  }
  const selected = changes.filter(c => c.score >= 4).sort((a, b) => b.score - a.score || a.sha.localeCompare(b.sha)).slice(0, 3);
  const channels = selected.length ? (config.releaseChannels ?? ['x', 'linkedin', 'email', 'devto']).filter(c => c !== 'devto' || technical(config.profile, selected)) : [];
  await writeJson(join(folder, 'selection.json'), { threshold: 4, changes, selected: selected.map(c => c.sha), issues, recommendation: selected.length ? 'Review selected posts' : 'No posts recommended' });
  const source = (c: Change) => github ? `https://github.com/${github}/commit/${c.sha}` : `git show ${c.sha}`;
  const notes = `# Release changes\n\n${changes.map(c => `- ${c.title} (${source(c)})`).join('\n')}\n\n${issues.map(i => `- ${i.html_url ? `[#${i.number}](${i.html_url})` : `#${i.number}`}: ${i.title}`).join('\n')}\n`;
  await writeLocal(join(folder, 'changelog.md'), notes);
  await writeLocal(join(folder, 'github-release.md'), notes + '\nDraft only. Human approval required.\n');
  await draftPosts(folder, channels, selected, source);
  const specText = await optionalText(launchDir(cwd).shots);
  const shots = specText ? checked<{ shots: { id: string; sources?: string[]; commands?: string[]; route?: string }[] }>('shots', parse(specText)).shots : [];
  const files = base ? git(cwd, 'diff', '--name-only', `${base}..${target}`).split('\n') : changes.flatMap(c => c.files);
  const reshot = shots.filter(s => affected(s, files)).map(s => s.id);
  const skipped: string[] = [];
  let captureUnavailable = '';
  if (reshot.length && options.shots !== false) {
    try {
      const captured = await takeShots(cwd, { ids: new Set(reshot) });
      await mkdir(join(folder, 'media'), { recursive: true });
      for (const shot of captured) for (const file of shot.files) await cp(join(launchDir(cwd).media, 'shots', file), join(folder, 'media', file));
    } catch (error) {
      if (!/Chrome unavailable/.test((error as Error).message)) throw error;
      captureUnavailable = 'Chrome unavailable'; skipped.push('Capture skipped: Chrome unavailable');
    }
  } else if (reshot.length) skipped.push('Capture skipped: --no-shots');
  let clipReason = captureUnavailable || (options.shots === false ? '--no-shots' : !reshot.length ? 'no changed screens' : !channels.includes('x') ? 'X not selected' : '');
  if (!clipReason) {
    let work: string | undefined;
    try {
      await run('ffmpeg', ['-version']);
      work = await mkdtemp(join(root(cwd), 'releases', '.clip-'));
      const paths = launchDir(work);
      await cp(join(folder, 'media'), join(paths.media, 'shots'), { recursive: true });
      await cp(launchDir(cwd).product, paths.product);
      await cp(launchDir(cwd).shots, paths.shots);
      await writeJson(join(paths.video, 'script.json'), { scenes: clipScenes(reshot, selected) });
      const result = await render(work, 'ffmpeg', ['16x9']);
      await cp(result.files[0], join(folder, 'media', 'x-clip.mp4'));
    } catch (error) { clipReason = `render unavailable: ${(error as Error).message.slice(0, 180)}`; }
    finally { if (work) await rm(work, { recursive: true, force: true }); }
  }
  if (clipReason) skipped.push(`clip skipped: ${clipReason}`);
  await writeLocal(join(folder, 'clip-storyboard.md'), `# X clip storyboard\n\n${reshot.map(id => `- ${id}: show changed screen`).join('\n') || 'No changed screens.'}\n`);
  const historyPath = join(root(cwd), 'releases', 'history.json');
  const history = (await readJson(historyPath, true) ?? { releases: [] }) as { lastRelaunch?: string; releases: { target: string; changes: Change[] }[] };
  const cumulative = readChanges(cwd, [target, `--since=${history.lastRelaunch ?? config.launchDate}`]).filter(c => c.score >= 4);
  const recommendation = relaunch(cumulative);
  history.releases = [...history.releases.filter(r => r.target !== target), { target, changes: selected }];
  await writeJson(historyPath, history);
  await writeLocal(join(folder, 'relaunch.md'), recommendation.text);
  const kit = { draft: true, channels, files: [] as string[], reshot, skipped, warnings, relaunch: recommendation };
  async function list(dir: string): Promise<string[]> { return (await Promise.all((await readdir(dir)).map(async name => (await stat(join(dir, name))).isDirectory() ? list(join(dir, name)) : [relative(folder, join(dir, name))]))).flat(); }
  kit.files = [...new Set([...await list(folder), 'kit.json'])].sort();
  await writeJson(join(folder, 'kit.json'), checked('release-kit', kit));
  return { kit: join(folder, 'kit.json'), channels, reshot, skipped, warnings, relaunch: recommendation, historyPath };
}
export function openReleasePr(cwd: string, folder: string, history: string, tag: string, files: string[]) {
  if (git(cwd, 'diff', '--cached', '--name-only')) throw new Error('Stage is not empty; refusing to commit unrelated files');
  const branch = `liftoff/release-${tag}`;
  git(cwd, 'switch', '-c', branch);
  git(cwd, 'add', '-f', '--', relative(cwd, folder), relative(cwd, history));
  git(cwd, 'commit', '-m', `Draft release ${tag}`);
  git(cwd, 'push', '-u', 'origin', branch);
  execFileSync('gh', ['pr', 'create', '--head', branch, '--title', `Draft release ${tag}`, '--body', `${files.map(f => '- ' + f).join('\n')}\n\nNothing has been published; approve and post manually`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return branch;
}
