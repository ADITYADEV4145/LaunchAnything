import { estimate } from '../adopt/estimate.js';
import { parseBrand } from '../adopt/brand.js';
import { sanitizeEvent } from '../adopt/telemetry.js';
import type { Check } from './types.js';
export const checks: Check[] = [{ name: 'adoption offline contracts', run({ cwd }) {
  const brand = parseBrand('<title>Sample</title><meta name="theme-color" content="#123456">');
  if (brand.name !== 'Sample' || brand.colors[0] !== '#123456') throw new Error('Brand import failed');
  if (estimate(cwd).totalTokens < 0) throw new Error('Invalid estimate');
  const event = sanitizeEvent({ stage: 'scan', completed: true, durationMs: 1234, path: cwd });
  if ('path' in event || event.durationMs !== 1000) throw new Error('Telemetry leaked data');
} }];
