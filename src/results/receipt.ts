import { site } from '../core/registry.js';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { checked, readJson, writeLocal } from './files.js';
import { addMetric, type PublishedPost, type Results } from './metrics.js';
import { plain } from './report.js';

const xml = (value: string) => value.replace(/[\uFFFE\uFFFF]/g, '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]!);
const format = new Intl.NumberFormat('en-US');
const signed = new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' });

function renderReceipt(results: Results, name: string, footer: boolean, trackedRelease: boolean, cwd?: string) {
  const rows = results.channels.filter(row => row.views !== undefined);
  const views = rows.reduce((sum, row) => addMetric(sum, row.views!), 0);
  const stars = results.channels.filter(row => row.starsDelta !== undefined);
  const starDelta = stars.reduce((sum, row) => addMetric(sum, row.starsDelta!), 0);
  const counts = [
    { label: 'RECORDED VIEWS', value: rows.length ? format.format(views) : 'Not reported' },
    { label: 'NET GITHUB STARS', value: stars.length ? signed.format(starDelta) : 'Not reported' },
  ];
  const channels = results.channels.filter(row => row.channel !== 'github-release' || trackedRelease ||
    row.views !== undefined || row.likes !== undefined || row.comments !== undefined ||
    row.clicks !== undefined || row.signups !== undefined || row.starsDelta === undefined);
  const title = plain(name, 42) || 'Launch receipt';
  const titleSize = Math.min(52, Math.floor(1040 / Array.from(title).length));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title">
  <title id="title">${xml(title)} launch receipt</title>
  <rect width="1200" height="630" rx="32" fill="#101524"/>
  <path d="M0 30Q0 0 30 0h1140q30 0 30 30v2H0z" fill="#97f0cf"/>
  <g font-family="system-ui, sans-serif">
    <text x="64" y="95" fill="#97f0cf" font-weight="700" font-size="19" letter-spacing="4">LAUNCH RECEIPT</text>
    <text x="64" y="164" fill="#f7f8fb" font-weight="700" font-size="${titleSize}">${xml(title)}</text>
    ${counts.map(({ value, label }, i) => `<g transform="translate(${64 + i * 542}, 208)">
      <rect width="530" height="146" rx="18" fill="#202941"/>
      <text x="24" y="45" fill="#cbd5ed" font-size="19" letter-spacing="2">${label}</text>
      <text x="24" y="109" fill="#f7f8fb" font-weight="700" font-size="40">${value}</text>
    </g>`).join('\n    ')}
    <text x="64" y="405" fill="#97f0cf" font-weight="700" font-size="17" letter-spacing="3">TRACKED CHANNELS</text>
    ${channels.map(({ channel }, i) =>
      `<text x="${64 + (i % 5) * 220}" y="${448 + Math.floor(i / 5) * 36}" fill="#f7f8fb" font-size="22">${xml(site(channel, cwd).label ?? site(channel, cwd).name)}</text>`).join('\n    ')}
    ${channels.length ? '' : '<text x="64" y="448" fill="#f7f8fb" font-size="22">None recorded</text>'}
    <path d="M64 551H1136" stroke="#52617e"/>
    <text x="64" y="590" fill="#bec9e0" font-size="16">Observed ${xml(results.observedAt.slice(0, 10))} · Views are not unique reach</text>
    ${footer ? '<text x="1136" y="590" text-anchor="end" fill="#97f0cf" font-size="16">launched with Liftoff</text>' : ''}
  </g>
</svg>\n`;
}

export async function receipt(cwd: string, footer = true) {
  const paths = launchDir(cwd);
  const results = checked<Results>('results', await readJson(paths.results));
  const product = await readJson(paths.product, true);
  const name = product === undefined ? 'Launch' : checked<{ name: string }>('product', product).name;
  const published = await readJson(paths.published, true);
  const tracked = published === undefined ? [] : checked<{ posts: PublishedPost[] }>('published', published).posts;
  const trackedRelease = tracked.some(post => post.channel === 'github-release' &&
    post.status !== 'failed' && post.status !== 'cancelled');
  const path = join(paths.root, 'receipt.svg');
  await writeLocal(path, renderReceipt(results, name, footer, trackedRelease, cwd));
  return { path };
}
