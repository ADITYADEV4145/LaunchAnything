import { existsSync, readFileSync, readdirSync, lstatSync, globSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { atomicWrite, assertSafePath } from '../copy/safe-path.js';

export interface Sample { id: string; source: string; channel: string; text: string }
export interface Voice {
  version: number; sentenceLength: number[]; commonOpeners: string[]; wordsUsed: string[];
  wordsNeverUsed: string[]; emojiRate: number; punctuation: { exclamationRate: number; dashRate: number };
  formality: number; threshold: number; samples: Sample[];
}
export const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
export const lengths = (text: string) => text.split(/[.!?]+(?:\s|$)/).map(s => words(s).length).filter(Boolean);
export const formality = (text: string) => {
  const tokens = words(text);
  return tokens.filter(w => w.length > 9).length / Math.max(1, tokens.length);
};
export function splitSamples(source: string): string[] {
  const raw = source.replace(/^\s*window\.YTD\.tweets\.part\d+\s*=\s*/, '').trim().replace(/;$/, '');
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : data.tweets ?? data.data;
    if (!Array.isArray(entries)) throw new Error('Expected an X archive array or tweets/data array');
    return entries.map(entry => entry.tweet ?? entry).sort((a, b) =>
      String(b.created_at ?? b.id_str ?? '').localeCompare(String(a.created_at ?? a.id_str ?? '')))
      .map(entry => entry.full_text ?? entry.text).filter((s): s is string => typeof s === 'string' && !!s.trim());
  }
  return source.split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(s => words(s).length >= 5);
}
export function learnVoice(cwd: string, inputs: string[], readme = false): Voice {
  const files = new Set<string>();
  function visit(path: string) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) for (const item of readdirSync(path, { withFileTypes: true })) {
      if (!item.name.startsWith('.') && item.name !== 'node_modules' && !item.isSymbolicLink()) visit(join(path, item.name));
    }
    else if (/\.(txt|md|markdown|json|js)$/i.test(path)) files.add(path);
  }
  for (const input of [...inputs, ...(readme ? ['README.md'] : [])]) {
    const matches = globSync(input, { cwd });
    if (!matches.length) throw new Error('No samples matched: ' + input);
    for (const match of matches) visit(resolve(cwd, match));
  }
  const samples: Sample[] = [];
  const seen = new Set<string>();
  for (const file of files) for (const text of splitSamples(readFileSync(file, 'utf8'))) {
    if (seen.has(text)) continue;
    seen.add(text);
    samples.push({ id: '', source: basename(file), channel: /tweets?\.(js|json)$/i.test(file) ? 'x' : 'general', text: text.slice(0, 4000) });
  }
  if (samples.length < 20) throw new Error('Voice learning requires at least 20 distinct owned samples (found ' + samples.length + ')');
  const selected = samples.sort((a, b) => b.text.length - a.text.length).slice(0, 50).map((s, i) => ({ ...s, id: 'sample-' + (i + 1) }));
  const text = selected.map(s => s.text).join('\n'), lens = lengths(text).sort((a, b) => a - b);
  const frequency = new Map<string, number>();
  for (const word of words(text)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const voice: Voice = {
    version: 1, sentenceLength: [lens[Math.floor(lens.length * .1)], lens[Math.floor(lens.length * .9)]],
    commonOpeners: [...new Set(selected.map(s => words(s.text).slice(0, 2).join(' ')))].slice(0, 20),
    wordsUsed: [...frequency].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([word]) => word),
    wordsNeverUsed: ['delve', 'synergy', 'revolutionary', 'game-changer'].filter(w => !frequency.has(w)),
    emojiRate: (text.match(/\p{Extended_Pictographic}/gu) ?? []).length / selected.length,
    punctuation: { exclamationRate: (text.match(/!/g) ?? []).length / selected.length, dashRate: (text.match(/—/g) ?? []).length / selected.length },
    formality: formality(text), threshold: 65, samples: selected
  };
  assertSafePath(cwd, join(launchDir(cwd).root, 'voice.json'));
  mkdirSync(launchDir(cwd).root, { recursive: true });
  atomicWrite(cwd, join(launchDir(cwd).root, 'voice.json'), JSON.stringify(voice, null, 2) + '\n');
  return voice;
}
export function loadVoice(cwd: string): Voice | undefined {
  const path = join(launchDir(cwd).root, 'voice.json');
  if (!existsSync(path)) return;
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = validateFile('voice', data);
  if (!result.valid) throw new Error('voice: ' + result.errors.join('; '));
  return data as Voice;
}
