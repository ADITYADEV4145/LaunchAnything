import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { packageRoot } from '../core/package-root.js';

export interface Exemplar { url: string; title: string; excerpt?: string; why: string; [key: string]: unknown }
export interface Exemplars { channel: string; source: string; patterns: string[]; examples: Exemplar[] }
export interface VoiceGuidelines {
  name: string; note: string; sources: { id: string; url: string; what: string }[];
  rules: { id: string; rule: string; avoid?: string; prefer?: string; source: string }[];
  checks: { hype: string[]; maxAverageSentenceWords: number; maxExclamations: number; maxEmoji: number };
}

const readYaml = (path: string) => existsSync(path) ? parse(readFileSync(path, 'utf8')) as Record<string, unknown> : undefined;
const list = <T>(value: unknown) => Array.isArray(value) ? value as T[] : [];

/** Packaged exemplars for a channel, followed by the user's own from .launch/exemplars/<channel>.yaml. */
export function loadExemplars(channel: string, cwd?: string): Exemplars {
  if (!/^[a-z0-9-]+$/.test(channel)) throw new Error('Invalid channel');
  const packaged = readYaml(join(packageRoot(), 'rules', 'exemplars', channel + '.yaml'));
  const own = cwd ? readYaml(join(cwd, '.launch', 'exemplars', channel + '.yaml')) : undefined;
  const examples = [...list<Exemplar>(own?.examples), ...list<Exemplar>(packaged?.examples)]
    .filter(e => e && typeof e.url === 'string' && /^https?:\/\//.test(e.url) && typeof e.title === 'string');
  return { channel, source: String(packaged?.source ?? 'No packaged exemplars for this channel.'),
    patterns: [...list<string>(own?.patterns), ...list<string>(packaged?.patterns)].filter(p => typeof p === 'string'), examples };
}

let guidelines: VoiceGuidelines | undefined;
export function loadVoiceGuidelines(): VoiceGuidelines {
  guidelines ??= readYaml(join(packageRoot(), 'rules', 'voice', 'founder.yaml')) as unknown as VoiceGuidelines;
  return guidelines;
}

const emoji = /\p{Extended_Pictographic}/gu;
/** Local checks for the researched founder voice, used when no learned voice.json exists. */
export function guidelineIssues(text: string, sentences: string[]) {
  const { checks } = loadVoiceGuidelines(), issues: { rule: string; message: string; fix: string }[] = [];
  const lower = text.toLowerCase();
  const hype = checks.hype.filter(word => new RegExp('(?<![a-z])' + word.replace(/-/g, '[- ]') + '(?![a-z])').test(lower));
  if (hype.length) issues.push({ rule: 'voice.hype', message: 'Marketing words: ' + hype.join(', '), fix: 'Replace each with a number, a name or a before/after.' });
  const prose = sentences.filter(s => !/^#|^```|^\|/.test(s));
  const average = prose.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / Math.max(1, prose.length);
  if (average > checks.maxAverageSentenceWords) issues.push({ rule: 'voice.long-sentences',
    message: 'Average sentence is ' + Math.round(average) + ' words', fix: 'Split sentences; aim for under ' + checks.maxAverageSentenceWords + ' words.' });
  if ((text.match(/!/g) ?? []).length > checks.maxExclamations) issues.push({ rule: 'voice.exclamation',
    message: 'More than ' + checks.maxExclamations + ' exclamation mark', fix: 'Let the facts carry the energy.' });
  if ((text.match(emoji) ?? []).length > checks.maxEmoji) issues.push({ rule: 'voice.emoji',
    message: 'More than ' + checks.maxEmoji + ' emoji', fix: 'Keep at most one emoji.' });
  return issues;
}
