import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeLocal } from '../results/files.js';
import { liveUrls, product, published, root, slug } from './common.js';

export function checkFriendDraft(text: string) {
  if (/\b(up[ -]?vot\w*|down[ -]?vot\w*|vote\w*|voting|rank(?:s|ed|ing|ings)?|boost us)\b/i.test(text))
    throw new Error('Friend draft contains vote/ranking language; remove it before sharing');
}
export async function friends(cwd: string, options: { check?: boolean } = {}) {
  const folder = join(root(cwd), 'friends');
  if (options.check) {
    const files = (await readdir(folder)).filter(f => f.endsWith('.md'));
    for (const file of files) checkFriendDraft(await readFile(join(folder, file), 'utf8'));
    return { checked: files.length, paths: files.map(f => join(folder, f)) };
  }
  const data = await readJson(join(root(cwd), 'friends.json')) as { people: { name: string; contact?: string; route?: string; note?: string; optedIn?: boolean }[] };
  if (!Array.isArray(data?.people) || data.people.some(p => !p || typeof p.name !== 'string' || !p.name.trim() || ![p.contact, p.route].some(v => typeof v === 'string' && v.trim()) || (p.note !== undefined && typeof p.note !== 'string')))
    throw new Error('friends.json requires people with name and contact or route');
  const info = await product(cwd), urls = liveUrls(await published(cwd));
  const paths: string[] = [], skipped: string[] = [], drafts: { path: string; text: string }[] = [];
  const used = new Set<string>();
  for (const person of data.people) {
    if (person.optedIn !== true) { skipped.push(person.name); continue; }
    const label = slug(person.name);
    if (used.has(label)) throw new Error('Duplicate friend filename; use distinct names');
    used.add(label);
    const text = `Route: ${person.contact ?? person.route}\n\nHi ${person.name},\n\nYou asked to hear when ${info.name} launched. ${info.oneLiner}\n\n${person.note ? `${person.note}\n\n` : ''}${urls}\n\nThanks for taking a look — I would love your honest feedback.\n`;
    checkFriendDraft(text);
    drafts.push({ path: join(folder, `${label}.md`), text });
  }
  for (const draft of drafts) { await writeLocal(draft.path, draft.text); paths.push(draft.path); }
  return { paths, skipped, sent: false };
}
