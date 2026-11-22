import { join } from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { readOptional } from '../review/posts.js';

export interface Scope { channel: string; route: string; account: string }
export interface Consent { version: 1; grants: (Scope & { by: string; at: string })[] }
export const consentPath = (root: string, mock = false) => join(root, mock ? 'go-consent.mock.json' : 'go-consent.json');
export const sameScope = (a: Scope, b: Scope) => a.channel === b.channel && a.route === b.route && a.account === b.account;
export async function readConsent(root: string, mock = false): Promise<Consent> {
  const data = JSON.parse(await readOptional(consentPath(root, mock)) ?? '{"version":1,"grants":[]}');
  if (data.version !== 1 || !Array.isArray(data.grants) || data.grants.some((g: any) =>
    !['channel', 'route', 'account', 'by', 'at'].every(key => typeof g?.[key] === 'string' && g[key].trim())))
    throw new Error('Invalid standing consent; revoke it before trying again');
  return data;
}
export async function saveConsent(root: string, consent: Consent, mock = false) {
  await writeFile(consentPath(root, mock), JSON.stringify(consent, null, 2) + '\n', { mode: 0o600 });
}
export async function revokeConsent(root: string) {
  await Promise.all([false, true].map(mock => rm(consentPath(root, mock), { force: true })));
}
