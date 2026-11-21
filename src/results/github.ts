import { execFileSync } from 'node:child_process';
import { checked, readJson } from './files.js';
import { launchDir } from '../core/launch-dir.js';

export async function githubStarsDelta(cwd: string, request: typeof fetch = fetch): Promise<number | undefined> {
  const scan = await readJson(launchDir(cwd).scan, true);
  if (scan === undefined) return undefined;
  const { stars } = checked<{ stars?: number }>('scan', scan);
  if (stars === undefined || !Number.isSafeInteger(stars)) return undefined;
  let remote: string;
  try {
    remote = execFileSync('git', ['config', '--local', '--get', 'remote.origin.url'],
      { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return undefined; }
  const repo = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remote);
  if (!repo || repo.slice(1).some(part => part === '.' || part === '..')) return undefined;
  const response = await request(`https://api.github.com/repos/${repo[1]}/${repo[2]}`, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  if (!response.ok) return undefined;
  const data = await response.json() as { private?: boolean; stargazers_count?: number } | null;
  const count = data?.stargazers_count;
  return data?.private === false && count !== undefined && Number.isSafeInteger(count) && count >= 0
    ? count - stars : undefined;
}
