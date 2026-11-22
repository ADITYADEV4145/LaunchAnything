import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../core/package-root.js';
import { site } from '../core/registry.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

export const channels = readdirSync(join(packageRoot(), 'rules/channels')).filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -5));
export interface Platform {
  style?: string[]; requiresAffiliationDisclosure?: boolean;
  kind: 'platform'; id: string; name: string; version: number; lastVerified: string | null; sources: string[];
  verified: boolean; verifiedFields: string[]; verificationNotes: string[];
  title: { required: boolean; maxLength: number; prefix?: string };
  body: { minLength: number; maxLength: number };
  maxLinks: number; requiredLink: boolean; bannedWords: string[];
  threadMax?: number; postMax?: number; hookMax?: number; guidance: string[];
  tryableNow?: boolean; taglineMax?: number; makerComment?: { heading: string; required: boolean };
  gallery?: { minImages: number; width: number; height: number };
  linkFirstComment?: boolean; captionMax?: number; subjectMax?: number;
  subreddits?: Record<string, { selfPromotion: 'allowed' | 'restricted' | 'forbidden'; flairRequired: boolean; verified: boolean; note: string }>;
}
const length = { type: 'integer', minimum: 1 };
const validate = new Ajv2020({ allErrors: true }).compile({
  type: 'object', additionalProperties: false,
  required: ['kind','id','name','version','lastVerified','sources','title','body','maxLinks','requiredLink','bannedWords','guidance','verified','verifiedFields','verificationNotes'],
  properties: {
    style: { type: 'array', items: { type: 'string' } },
    requiresAffiliationDisclosure: { type: 'boolean' },
    kind: { const: 'platform' }, id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' }, name: { type: 'string', minLength: 1 },
    version: length, lastVerified: { anyOf: [{ type: 'null' }, { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }] },
    verified: { type: 'boolean' },
    verifiedFields: { type: 'array', items: { type: 'string' } },
    verificationNotes: { type: 'array', minItems: 1, items: { type: 'string' } },
    sources: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^https://' } },
    title: { type: 'object', additionalProperties: false, required: ['required','maxLength'], properties: {
      required: { type: 'boolean' }, maxLength: length, prefix: { type: 'string' } } },
    body: { type: 'object', additionalProperties: false, required: ['minLength','maxLength'], properties: { minLength: length, maxLength: length } },
    maxLinks: { type: 'integer', minimum: 0 }, requiredLink: { type: 'boolean' },
    bannedWords: { type: 'array', items: { type: 'string', minLength: 1 } },
    threadMax: length, postMax: length, hookMax: length,
    tryableNow: { type: 'boolean' }, taglineMax: length, captionMax: length, subjectMax: length,
    linkFirstComment: { type: 'boolean' },
    makerComment: { type: 'object', additionalProperties: false, required: ['heading','required'], properties: {
      heading: { type: 'string', minLength: 1 }, required: { type: 'boolean' } } },
    gallery: { type: 'object', additionalProperties: false, required: ['minImages','width','height'],
      properties: { minImages: length, width: length, height: length } },
    subreddits: { type: 'object', minProperties: 1, patternProperties: {
      '^r/[A-Za-z0-9_]+$': { type: 'object', additionalProperties: false,
        required: ['selfPromotion','flairRequired','verified','note'], properties: {
          selfPromotion: { enum: ['allowed','restricted','forbidden'] }, flairRequired: { type: 'boolean' },
          verified: { type: 'boolean' }, note: { type: 'string', minLength: 1 } } }
    }, additionalProperties: false },
    guidance: { type: 'array', items: { type: 'string' } }
  }
});
export function loadPlatform(id: string, cwd?: string): Platform {
  const data = site(id, cwd).copy;
  if (!validate(data)) throw new Error('Invalid platform rule: ' + JSON.stringify(validate.errors));
  const rule = data as unknown as Platform;
  if (rule.body.minLength > rule.body.maxLength) throw new Error('Inconsistent platform rule: ' + id);
  return rule;
}
