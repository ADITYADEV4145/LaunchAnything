import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { purposes } from './storyboard.js';

const text = (...values: unknown[]): string => values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim() ?? '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())) : typeof value === 'string' && value.trim() ? [value] : [];
async function optionalJson(file: string): Promise<Record<string, any>> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}
export async function planShots(cwd: string, options: { force?: boolean } = {}) {
  const paths = launchDir(cwd);
  let existing: Record<string, any> = {};
  try {
    const source = await readFile(paths.shots, 'utf8');
    if (!options.force) throw new Error('shots.yaml already exists; use --force to overwrite');
    existing = parse(source) ?? {};
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const product = JSON.parse(await readFile(paths.product, 'utf8'));
  const pkg = await optionalJson(join(cwd, 'package.json'));
  const raw = product.money_moment;
  const moment = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const feature = product.features?.[0];
  const summary = text(typeof raw === 'string' ? raw : '', moment.summary, moment.headline, moment.moment, moment.description, moment.after, product.oneLiner, product.problem, product.proofPoints?.[0], typeof feature === 'string' ? feature : feature?.description, feature?.name, product.name);
  const pain = text(moment.before, product.problem?.summary, product.problem, summary);
  const after = text(moment.after, summary);
  const proof = text(moment.proof, product.proofPoints?.[0], typeof feature === 'string' ? feature : feature?.description, feature?.name, summary);
  const web = Boolean(text(moment.route)) || existing.shots?.some((shot: { route?: string }) => shot.route) ||
    (Boolean(pkg.scripts?.dev || pkg.scripts?.start) && Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(name => /^(?:next|vite|react-scripts|astro|remix|@remix-run\/.*|nuxt|sveltekit|@sveltejs\/kit)$/.test(name)));
  const commands = strings(moment.commands).length ? strings(moment.commands) : strings(moment.command);
  const setup = strings(moment.setup);
  const route = text(moment.route, existing.shots?.find((shot: { route?: string }) => shot.route)?.route, 'TODO');
  const highlight = moment.highlight && typeof moment.highlight === 'object' ? moment.highlight :
    web ? { selector: text(moment.highlight, moment.selector, moment.element, 'body') } : { text: text(moment.highlight, after).split(/\s+/)[0] };
  const captions = [pain, pain, text(moment.action, summary), after, proof, text(product.oneLiner, summary)];
  const shots = purposes.map((purpose, index) => ({
    id: purpose, purpose, caption: captions[index].split(/\s+/).slice(0, 12).join(' '),
    ...(purpose === 'after' ? { moneyMoment: true } : {}),
    viewport: { width: 1600, height: 900 },
    ...(web ? { route, element: text(moment.selector, moment.element, 'body'), highlight, themes: ['light', 'dark'] } :
      { commands: commands.length ? commands : ['TODO'], ...(setup.length ? { setup } : {}), highlight }),
  }));
  const storyboard = { ...(existing.baseUrl ? { baseUrl: existing.baseUrl } : {}), ...(existing.startCommand ? { startCommand: existing.startCommand } : {}), shots };
  try { await writeFile(paths.shots, stringify(storyboard), { flag: options.force ? 'w' : 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('shots.yaml already exists; use --force to overwrite'); throw error; }
  return { path: paths.shots, kind: web ? 'web' : 'cli', storyboard, brief: { product: product.name, rules: 'Agent: review captions and shot actions against the repo. Replace every TODO command/route from the repo before capture. Use hidden setup for preparation; keep exactly one moneyMoment and storyboard order. No invented claims or numbers.' } };
}
