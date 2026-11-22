import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import { assertSchema, optionalText, readJson, writeJson } from './files.js';
import { repositoryFiles } from './scan.js';

export interface Config {
  profile: string;
  launchType: string;
  channels: string[];
  timezone: string;
  launchDate: string;
  profileConfirmed: boolean;
  brandKit?: string;
  approvers?: { name: string; role?: string }[];
  redact?: string[];
}
export interface InitOptions {
  profile?: string; type?: string; yes?: boolean; timezone?: string; date?: string; force?: boolean;
}
export async function detectProfile(cwd: string): Promise<string> {
  const text = await optionalText(join(cwd, 'package.json'));
  const pkg = text ? JSON.parse(text) : {};
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  if (pkg.bin) return 'devtool';
  if (dependencies.expo || dependencies['react-native']) return 'consumer-mobile';
  const pricing = (await repositoryFiles(cwd)).some(path =>
    /^(?:src\/)?(?:app\/(?:.*\/)?pricing\/page|pages\/pricing(?:\/index)?)\.[jt]sx?$/.test(path));
  if ((dependencies.next || dependencies.react) && pricing) return 'indie-saas';
  return 'devtool';
}
export function validateConfig(config: Config, cwd?: string) {
  assertSchema('config', config);
  config.channels.forEach(id => loadRule('channels', id, cwd));
  try { new Intl.DateTimeFormat('en', { timeZone: config.timezone }).format(); }
  catch { throw new Error(`Invalid timezone: ${config.timezone}`); }
}
function message(config: Config): string {
  return config.profileConfirmed ? 'Profile confirmed. Run liftoff scan next.' :
    `Confirm the detected profile once: rerun liftoff init --profile ${config.profile} --yes (or choose another profile).`;
}
export async function init(cwd: string, options: InitOptions = {}) {
  const paths = launchDir(cwd);
  let existing: Config | undefined;
  try { if (!options.force) existing = await readJson<Config>(paths.config); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing && !options.force) {
    validateConfig(existing, cwd);
    if (!existing.profileConfirmed && options.profile && options.yes) {
      const rule = loadRule('profiles', options.profile);
      const config = { ...existing, profile: options.profile, channels: rule.defaultChannels as string[], profileConfirmed: true };
      validateConfig(config, cwd);
      await writeJson(paths.config, config);
      return { config, path: paths.config, created: false, message: message(config) };
    }
    return { config: existing, path: paths.config, created: false,
      message: message(existing) + ' Existing config preserved; use --force to replace it.' };
  }
  const profile = options.profile ?? await detectProfile(cwd);
  const rule = loadRule('profiles', profile);
  const config: Config = {
    profile, launchType: options.type ?? 'new-product', channels: rule.defaultChannels as string[],
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    launchDate: options.date ?? new Date().toISOString().slice(0, 10),
    profileConfirmed: Boolean(options.yes || options.profile), approvers: [], redact: [],
  };
  validateConfig(config, cwd);
  await writeJson(paths.config, config, !options.force);
  return { config, path: paths.config, created: true, message: message(config) };
}
