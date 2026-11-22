import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as formats } from 'ajv-formats';
import { packageRoot } from './package-root.js';
import { storyboardErrors } from '../media/storyboard.js';

const ajv = new Ajv2020({ allErrors: true });
const addFormats = formats as unknown as (instance: Ajv2020) => void;
addFormats(ajv);
for (const file of readdirSync(join(packageRoot(), 'schemas')).filter(f => f.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(readFileSync(join(packageRoot(), 'schemas', file), 'utf8')), file.replace('.schema.json', ''));
}

export function validateFile(kind: string, data: unknown): { valid: boolean; errors: string[] } {
  const validate = ajv.getSchema(kind.replace(/\.schema\.json$/, ''));
  if (!validate) return { valid: false, errors: [`Unknown schema: ${kind}`] };
  const valid = Boolean(validate(data));
  const errors = (validate.errors ?? []).map(e =>
    `${e.instancePath || '/'} ${e.message}${e.params.missingProperty ? `: ${e.params.missingProperty}` : ''}`);
  if (kind.replace(/\.schema\.json$/, '') === 'shots' && valid) errors.push(...storyboardErrors(data));
  return { valid: valid && errors.length === 0, errors };
}
