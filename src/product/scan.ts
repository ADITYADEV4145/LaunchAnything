import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { assertSchema, git, optionalText, writeJson } from './files.js';

export function readmeSections(text: string) {
  const sections: { heading: string; body: string }[] = [];
  let heading = 'Introduction', lines: string[] = [];
  const flush = () => { if (lines.join('\n').trim() || heading !== 'Introduction') sections.push({ heading, body: lines.join('\n').trim() }); };
  for (const line of text.split(/\r?\n/)) {
    const match = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (match) { flush(); heading = match[1]; lines = []; } else lines.push(line);
  }
  flush();
  return sections;
}
export async function repositoryFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set(['.git', '.launch', 'node_modules', '.next', '.expo', 'dist', 'build', 'coverage', 'vendor']);
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(cwd, path).split('\\').join('/'));
    }
  }
  await walk(cwd);
  return files.sort();
}
export function routesFromFiles(files: string[]): string[] {
  return files.filter(path =>
    /^(?:src\/)?app\/(?:.*\/)?(?:page\.[jt]sx?|index\.[jt]sx?|[^/]+\.[jt]sx?)$/.test(path)
      && !/(?:^|\/)(?:layout|_layout|not-found|error|loading|global-error|template)\.[jt]sx?$/.test(path) ||
    /^(?:src\/)?pages\/(?!api\/)(?!_).*\.[jt]sx?$/.test(path) ||
    /^(?:bin|commands|src\/commands)\//.test(path));
}
function landingUrl(pkg: Record<string, unknown>, readme: string): string | undefined {
  const candidates = [typeof pkg.homepage === 'string' ? pkg.homepage : '', ...(readme.match(/https?:\/\/[^\s<>)"\]]+/g) ?? [])];
  return candidates.find(url => { try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; } });
}
export function githubRepository(remote: string): string | undefined {
  return /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)?.[1];
}
export async function scan(cwd: string, options: { github?: boolean } = {}) {
  const pkgText = await optionalText(join(cwd, 'package.json'));
  const pkg = pkgText ? JSON.parse(pkgText) as Record<string, unknown> : {};
  const readme = await optionalText(join(cwd, 'README.md')) || await optionalText(join(cwd, 'readme.md'));
  const license = await optionalText(join(cwd, 'LICENSE')) || await optionalText(join(cwd, 'LICENSE.md'));
  const files = await repositoryFiles(cwd);
  const tag = git(cwd, ['describe', '--tags', '--abbrev=0']);
  const log = git(cwd, ['log', '--format=%H%x09%s', ...(tag ? [`${tag}..HEAD`] : [])]) ?? '';
  const url = landingUrl(pkg, readme);
  const data: Record<string, unknown> = {
    readmeSections: readmeSections(readme), package: pkg, license,
    commits: log.split('\n').filter(Boolean).map(line => { const [sha, ...subject] = line.split('\t'); return { sha, subject: subject.join('\t') }; }),
    routes: routesFromFiles(files),
    screenshots: files.filter(path => /\.(?:png|jpe?g|gif|webp|svg)$/i.test(path) && /(?:screenshot|screen-shot|snapshot|demo|capture|\.gif$)/i.test(path)),
    ...(url ? { landingUrl: url } : {}),
  };
  const warnings: string[] = [];
  if (options.github ?? process.env.LIFTOFF_ALLOW_NETWORK === '1') {
    const remote = git(cwd, ['config', '--get', 'remote.origin.url']) ?? '';
    const repo = githubRepository(remote);
    if (repo) {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as { private?: boolean; stargazers_count?: number };
        if (result.private === false && Number.isInteger(result.stargazers_count) && result.stargazers_count! >= 0) data.stars = result.stargazers_count;
      } catch { warnings.push('GitHub stars unavailable; continuing with local facts.'); }
    }
  }
  assertSchema('scan', data);
  const path = launchDir(cwd).scan;
  await writeJson(path, data);
  return { path, scan: data, warnings };
}
