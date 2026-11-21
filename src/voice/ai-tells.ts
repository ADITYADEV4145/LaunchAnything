import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { words } from './learn.js';

export function aiTells(text: string, channel: string) {
  const rule = parse(readFileSync(join(packageRoot(), 'rules/ai-tells.yaml'), 'utf8')) as {
    patterns: { id: string; phrase?: string; regex?: string; message: string; allow?: string[] }[];
    emDashPer100Words: number; ruleOfThree: { regex: string; message: string };
  };
  const issues = rule.patterns.filter(p => !p.allow?.includes(channel) && (p.phrase
    ? text.toLowerCase().includes(p.phrase.toLowerCase()) : new RegExp(p.regex!, 'iu').test(text)))
    .map(p => ({ rule: 'ai-tells.' + p.id, message: p.message }));
  if ((text.match(/—/g) ?? []).length >= 2 && (text.match(/—/g) ?? []).length * 100 / Math.max(1, words(text).length) > rule.emDashPer100Words)
    issues.push({ rule: 'ai-tells.em-dash', message: 'Em-dash density exceeds local editorial threshold.' });
  if (new RegExp(rule.ruleOfThree.regex, 'iu').test(text)) issues.push({ rule: 'ai-tells.rule-of-three', message: rule.ruleOfThree.message });
  return issues;
}
