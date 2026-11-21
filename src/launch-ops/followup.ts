import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { checked, readJson, writeLocal } from '../results/files.js';
import { metricNames, type Results, type ResultConfig } from '../results/metrics.js';
import { commitNotes, commits, liveUrls, optionalText, product, published, root } from './common.js';

export function observedCounts(results: Results) {
  return results.channels.length ? results.channels.map(row => `${row.channel}: ${metricNames.map(name => `${name} ${row[name] ?? 'unreported'}`).join(', ')}`).join('\n') : 'Metrics unreported.';
}
export async function followup(cwd: string) {
  const info = await product(cwd), urls = liveUrls(await published(cwd));
  const results = checked<Results>('results', await readJson(launchDir(cwd).results));
  const config = checked<ResultConfig>('config', await readJson(launchDir(cwd).config));
  const start = new Date(`${config.launchDate}T00:00:00Z`), end = new Date(start.getTime() + 7 * 86400000);
  const rows = commits(cwd, ['HEAD', `--since=${start.toISOString()}`, `--until=${end.toISOString()}`]);
  const report = await optionalText(launchDir(cwd).report);
  const lessons = report.match(/^## Lessons[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim() || 'No report lessons recorded.';
  const folder = join(root(cwd), 'followup');
  const files: Record<string, string> = {
    'thank-you.md': `# Thank you\n\nThanks to everyone who tried ${info.name} and shared feedback.\n\n${urls}\n`,
    'what-we-learned.md': `# What we learned\n\nRecorded observations only; these counts do not establish causation.\n\n${observedCounts(results)}\n\n${lessons}\n`,
    'email-to-signups.txt': `Subject: Thank you for trying ${info.name}\n\nThanks for signing up. ${info.oneLiner}\n\n${urls}\n\nWe welcome your feedback.\n`,
    'changelog.md': `# Launch-week changelog\n\nWindow: ${start.toISOString()} to ${end.toISOString()} (UTC).\n\n${commitNotes(rows) || 'No commits recorded in this window.'}\n`,
  };
  for (const [name, text] of Object.entries(files)) await writeLocal(join(folder, name), text);
  return { paths: Object.keys(files).map(name => join(folder, name)), sent: false };
}
