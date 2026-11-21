import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { packageRoot } from '../core/package-root.js';

export const channels = ['show-hn','product-hunt','x','linkedin','reddit','devto','indie-hackers','github-release','tiktok','reels','shorts','instagram','email','blog','press-release'] as const;
export interface Platform {
  kind: 'platform'; id: string; name: string; version: number; lastVerified: string; sources: string[];
  title: { required: boolean; maxLength: number; prefix?: string };
  body: { minLength: number; maxLength: number };
  maxLinks: number; requiredLink: boolean; bannedWords: string[];
  threadMax?: number; postMax?: number; hookMax?: number; guidance: string[];
}
const length = { type: 'integer', minimum: 1 };
const validate = new Ajv2020({ allErrors: true }).compile({
  type: 'object', additionalProperties: false,
  required: ['kind','id','name','version','lastVerified','sources','title','body','maxLinks','requiredLink','bannedWords','guidance'],
  properties: {
    kind: { const: 'platform' }, id: { enum: channels }, name: { type: 'string', minLength: 1 },
    version: length, lastVerified: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    sources: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^https://' } },
    title: { type: 'object', additionalProperties: false, required: ['required','maxLength'], properties: {
      required: { type: 'boolean' }, maxLength: length, prefix: { type: 'string' } } },
    body: { type: 'object', additionalProperties: false, required: ['minLength','maxLength'], properties: { minLength: length, maxLength: length } },
    maxLinks: { type: 'integer', minimum: 0 }, requiredLink: { type: 'boolean' },
    bannedWords: { type: 'array', items: { type: 'string', minLength: 1 } },
    threadMax: length, postMax: length, hookMax: length,
    guidance: { type: 'array', items: { type: 'string' } }
  }
});
export function loadPlatform(id: string): Platform {
  if (!channels.includes(id as typeof channels[number])) throw new Error('Unknown channel: ' + id);
  const data: unknown = parse(readFileSync(join(packageRoot(), 'rules/platforms', id + '.yaml'), 'utf8'));
  if (!validate(data)) throw new Error('Invalid platform rule: ' + JSON.stringify(validate.errors));
  const rule = data as Platform;
  if (rule.id !== id || rule.body.minLength > rule.body.maxLength) throw new Error('Inconsistent platform rule: ' + id);
  return rule;
}
