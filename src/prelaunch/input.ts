import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { launchDir } from '../core/launch-dir.js';
import { assertSafePath } from '../copy/safe-path.js';

const evidence = {
  type: 'object', additionalProperties: false, required: ['passed', 'notes'],
  properties: { passed: { type: 'boolean' }, notes: { type: 'string', maxLength: 1000 } },
  if: { properties: { passed: { const: true } } },
  then: { properties: { notes: { type: 'string', pattern: '\\S' } } },
} as const;
const text = (maxLength: number) => ({ type: 'string', maxLength });
const schema = {
  type: 'object', additionalProperties: false, required: ['checks'],
  properties: {
    threshold: { type: 'integer', minimum: 70, maximum: 100 },
    checks: {
      type: 'object', additionalProperties: false, required: ['install', 'demo', 'mainPath'],
      properties: { install: evidence, demo: evidence, mainPath: evidence },
    },
    installCommand: { ...text(200), pattern: '^[^\\u0000-\\u001f\\u007f]*$' },
    readme: text(200), landingSnapshot: text(200), landingUrl: text(2048),
    demoUrl: text(2048), ogImageUrl: text(2048),
    demoAboveFold: { type: ['boolean', 'null'] },
    landingLcpMs: { type: ['number', 'null'], exclusiveMinimum: 0 },
    campaign: { ...text(100), pattern: '^(?:[a-z0-9]+(?:[-_][a-z0-9]+)*)?$' },
    feedbackUrl: text(2048), faqPath: text(200), gettingStartedPath: text(200),
    waitlist: {
      type: 'object', additionalProperties: false, required: ['provider', 'action'],
      properties: {
        provider: { enum: ['resend', 'loops', 'kit'] },
        action: { ...text(200), pattern: '^/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+$' },
      },
    },
  },
} as const;
let validate: ReturnType<Ajv2020['compile']> | undefined;

type Check = { passed: boolean; notes: string };
export interface Input {
  threshold?: number;
  checks: Record<'install' | 'demo' | 'mainPath', Check>;
  installCommand?: string;
  readme?: string;
  landingSnapshot?: string;
  demoAboveFold?: boolean | null;
  landingLcpMs?: number | null;
  campaign?: string;
  landingUrl?: string;
  demoUrl?: string;
  ogImageUrl?: string;
  feedbackUrl?: string;
  faqPath?: string;
  gettingStartedPath?: string;
  waitlist?: { provider: 'resend' | 'loops' | 'kit'; action: string };
}

export const emptyInput: Input = {
  threshold: 80,
  checks: {
    install: { passed: false, notes: '' },
    demo: { passed: false, notes: '' },
    mainPath: { passed: false, notes: '' },
  },
  installCommand: '', landingSnapshot: '', landingUrl: '', demoUrl: '', ogImageUrl: '',
  demoAboveFold: null, landingLcpMs: null, campaign: '', feedbackUrl: '',
  waitlist: { provider: 'resend', action: '/api/waitlist' },
};

export const inputPath = (cwd?: string) => join(launchDir(cwd).root, 'prelaunch.json');

export function readText(cwd: string, path: string) {
  assertSafePath(cwd, path);
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Expected a local text file under 2 MiB: ' + path);
  const content = readFileSync(path, 'utf8');
  if (content.includes('\0')) throw new Error('Expected a text file: ' + path);
  return content;
}

export function webUrl(value: string) {
  const url = URL.parse(value);
  return url && /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : undefined;
}

export function isFeedbackUrl(value: string) {
  const url = webUrl(value);
  return !!url && url.protocol === 'https:' && (
    (url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+\/discussions\/?$/.test(url.pathname)) ||
    (url.hostname === 'discord.gg' && /^\/[\w-]+\/?$/.test(url.pathname)) ||
    (url.hostname === 'discord.com' && /^\/invite\/[\w-]+\/?$/.test(url.pathname))
  );
}

export function readInput(cwd: string): Input | undefined {
  const raw = readText(cwd, inputPath(cwd));
  if (raw === undefined) return;
  const data: unknown = JSON.parse(raw);
  validate ??= new Ajv2020({ allErrors: true, allowUnionTypes: true }).compile(schema);
  if (!validate(data)) throw new Error('prelaunch.json: ' + validate.errors?.map(error =>
    `${error.instancePath || '/'} ${error.message}`).join('; '));
  const input = data as Input;
  if (input.checks.install.passed && !input.installCommand?.trim())
    throw new Error('prelaunch.json: set installCommand to the one command you verified');
  for (const key of ['landingUrl', 'demoUrl', 'ogImageUrl'] as const)
    if (input[key] && !webUrl(input[key])) throw new Error(`prelaunch.json: ${key} must be a credential-free HTTP(S) URL`);
  if (input.feedbackUrl && !isFeedbackUrl(input.feedbackUrl))
    throw new Error('prelaunch.json: feedbackUrl must be a GitHub Discussions or Discord invite URL');
  return input;
}

export function auditPaths(input: Input) {
  const paths = {
    readme: input.readme ?? 'README.md',
    landing: input.landingSnapshot || undefined,
    faq: input.faqPath ?? 'docs/faq.md',
    gettingStarted: input.gettingStartedPath ?? 'docs/getting-started.md',
  };
  const entries = Object.values(paths).filter(path => path !== undefined);
  if (entries.some(path => !/^(?:[a-z0-9_-][a-z0-9._-]*\/)*[a-z0-9_-][a-z0-9._-]*$/i.test(path)) ||
      new Set(entries.map(path => path.toLowerCase())).size !== entries.length)
    throw new Error('prelaunch.json: use distinct, repository-relative documentation paths');
  if (![paths.readme, paths.faq, paths.gettingStarted].every(path => /\.md$/i.test(path)) ||
      (paths.landing && !/\.html?$/i.test(paths.landing)))
    throw new Error('prelaunch.json: use Markdown documentation and an HTML landing snapshot');
  return paths;
}
