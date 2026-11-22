import { resolve } from 'node:path';
import { audiencePath, checked, json, readJson, readLocal, writeLocal } from './files.js';

interface KitDraft { provider: 'kit'; headline: string; description: string; consentText: string }
interface Signup { email: string; consent: true; consentedAt: string }
const kitPath = (cwd: string) => audiencePath(cwd, 'kit', 'setup.json');
const signupPath = (cwd: string) => audiencePath(cwd, 'kit', 'signups.json');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function setupWaitlist(cwd: string, idea: string) {
  const setup = kitPath(cwd);
  const existing = readLocal(cwd, setup);
  const draft = checked<KitDraft>('audience-kit', existing === undefined ? {
    provider: 'kit',
    headline: 'Get launch updates',
    description: `I'm exploring ${idea}. Join the waitlist if you'd like to hear when there's something to try. — Aditya`,
    consentText: 'Email me about this launch. I can unsubscribe anytime.',
  } : JSON.parse(existing));
  if (existing === undefined) writeLocal(cwd, setup, json(draft));
  const preview = audiencePath(cwd, 'kit', 'preview.html');
  writeLocal(cwd, preview, [
    '<!doctype html>', '<html lang="en"><meta charset="utf-8"><title>Kit waitlist draft</title>',
    '<main><p>Draft only — this preview does not collect email addresses.</p>',
    `<h1>${escapeHtml(draft.headline)}</h1><p>${escapeHtml(draft.description)}</p>`,
    '<fieldset disabled><label>Email address <input type="email"></label>',
    `<label><input type="checkbox"> ${escapeHtml(draft.consentText)}</label>`,
    '<button type="button">Join the waitlist</button></fieldset></main></html>', '',
  ].join('\n'));
  return { setup, preview, live: false };
}

function signups(cwd: string) {
  readJson<KitDraft>(cwd, kitPath(cwd), 'audience-kit');
  return readJson<Signup[]>(cwd, signupPath(cwd), 'audience-signups', []);
}

const emailKey = (entry: Signup) => entry.email.toLowerCase();

export function importSignups(cwd: string, file: string) {
  const current = signups(cwd);
  const incoming = readJson<Signup[]>(cwd, resolve(cwd, file), 'audience-signups');
  const entries = new Map(current.map(entry => [emailKey(entry), entry]));
  const before = entries.size;
  for (const entry of incoming) {
    if (Date.parse(entry.consentedAt) > Date.now()) throw new Error('Consent timestamp cannot be in the future');
    if (!entries.has(emailKey(entry))) entries.set(emailKey(entry), entry);
  }
  const path = signupPath(cwd);
  writeLocal(cwd, path, json([...entries.values()]));
  return { path, imported: entries.size - before, total: entries.size, synced: false };
}

export function exportSignups(cwd: string) {
  const entries = [...new Set(signups(cwd).map(emailKey))].sort();
  const path = audiencePath(cwd, 'kit', 'kit-import.csv');
  writeLocal(cwd, path, ['Email', ...entries.map(email => '"' + email.replace(/"/g, '""') + '"'), ''].join('\r\n'));
  return { path, total: entries.length, synced: false };
}
