import { mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { assertSafePath, atomicWrite } from '../copy/safe-path.js';
import { audit } from './audit.js';
import { emptyInput, inputPath, readInput, readText, webUrl, type Input } from './input.js';
import { scoreReadiness } from './score.js';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const repoPath = (cwd: string, path: string) => relative(cwd, path).split(sep).join('/');

function tracking(cwd: string, input: Input) {
  if (!input.landingUrl || !input.campaign)
    return { links: {}, note: 'Set landingUrl and campaign to generate links.' };
  const settings: unknown = JSON.parse(readText(cwd, launchDir(cwd).config) ?? 'null');
  const verdict = validateFile('config', settings);
  if (!verdict.valid) throw new Error('config.json: ' + verdict.errors.join('; '));
  const { channels } = settings as { channels: string[] };
  const links = Object.fromEntries([...new Set(channels)].map(channel => {
    const url = webUrl(input.landingUrl!)!;
    for (const key of [...url.searchParams.keys()])
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    url.searchParams.set('utm_source', channel);
    url.searchParams.set('utm_medium', 'launch');
    url.searchParams.set('utm_campaign', input.campaign!);
    return [channel, url.href];
  }));
  return { links, note: 'Use each channel’s link in its draft before review and approval.' };
}

function waitlist(input: Input) {
  if (!input.waitlist) return {
    form: '<!-- Waitlist not configured. -->\n', email: 'Waitlist not configured.\n',
    provider: null, setup: 'Set waitlist.provider and waitlist.action to generate drafts.',
  };
  const { provider, action } = input.waitlist;
  const handlers = {
    resend: 'Use an audience contact and a welcome-email send after consent.',
    loops: 'Use a contact and trigger a welcome loop after consent.',
    kit: 'Subscribe the contact to the relevant Kit form and attach a welcome sequence after consent.',
  };
  return {
    provider,
    setup: 'Implement and review the same-origin route before embedding. Keep credentials server-side, validate input, limit abuse, deduplicate signups, and handle consent and unsubscribe. ' + handlers[provider],
    form: [
      '<!-- Draft: implement and review the server handler before embedding this form. -->',
      `<form action="${action}" method="post">`,
      '  <label>Email address <input type="email" name="email" autocomplete="email" required></label>',
      '  <label><input type="checkbox" name="consent" value="yes" required> Email me about this launch.</label>',
      '  <button type="submit">Join the waitlist</button>',
      '</form>', '',
    ].join('\n'),
    email: [
      'Subject: You’re on the waitlist', '',
      'Thanks for signing up. We’ll email you when there’s launch news to share.',
      '', 'If you didn’t sign up, you can ignore this email.',
      '', '[Replace with your provider’s unsubscribe link before sending.]', '',
    ].join('\n'),
  };
}

export function initializePrelaunch(cwd = process.cwd()) {
  const path = inputPath(cwd);
  if (readText(cwd, path) !== undefined) throw new Error('Already exists: ' + repoPath(cwd, path));
  const { root } = launchDir(cwd);
  assertSafePath(cwd, root);
  mkdirSync(root, { recursive: true });
  atomicWrite(cwd, path, json(emptyInput));
  return { path: repoPath(cwd, path), next: 'Record your checks, then run liftoff prelaunch.' };
}

export function prelaunch(cwd = process.cwd()) {
  const input = readInput(cwd);
  if (!input) throw new Error('No .launch/prelaunch.json; run liftoff prelaunch --init first');
  const { patch, ...audits } = audit(cwd, input);
  const { form, email, ...capture } = waitlist(input);
  const links = tracking(cwd, input);
  const directory = join(launchDir(cwd).root, 'prelaunch');
  const files = {
    report: join(directory, 'report.json'),
    suggestedFixes: join(directory, 'suggested-fixes.diff'),
    trackingLinks: join(directory, 'tracking-links.json'),
    signupForm: join(directory, 'waitlist.html'),
    welcomeEmail: join(directory, 'welcome-email.txt'),
  };
  const report = {
    readiness: scoreReadiness(input), ...audits, capture, tracking: links,
    files: Object.fromEntries(Object.entries(files).map(([key, path]) => [key, repoPath(cwd, path)])),
  };
  for (const file of Object.values(files)) assertSafePath(cwd, file);
  mkdirSync(directory, { recursive: true });
  atomicWrite(cwd, files.suggestedFixes, patch);
  atomicWrite(cwd, files.trackingLinks, json(links.links));
  atomicWrite(cwd, files.signupForm, form);
  atomicWrite(cwd, files.welcomeEmail, email);
  atomicWrite(cwd, files.report, json(report));
  return report;
}
