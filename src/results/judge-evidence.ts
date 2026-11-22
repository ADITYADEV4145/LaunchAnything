import { join } from 'node:path';
import { copyRubric, criteria } from '../copy/judge-rubric.js';
import { assertSafePath } from '../copy/safe-path.js';
import { readJson } from './files.js';
import { record, type Judgement, type ManualObservation } from './metrics.js';

export async function linkJudgeEvidence(cwd: string, postsDir: string, manual: Map<string, ManualObservation>) {
  const references = [...manual].filter(([, observation]) => observation.judgeSourceHash !== undefined);
  if (!references.length) return undefined;
  if ([...manual.values()].some(observation => observation.judge))
    throw new Error('Use either judgeSourceHash links or manually supplied judge scores, not both.');
  const path = join(postsDir, 'judge.json');
  assertSafePath(cwd, path);
  const raw = await readJson(path, true);
  if (raw === undefined) throw new Error('No judge.json found for judgeSourceHash links; keep the verdicts for the published drafts.');
  const { posts } = record(raw);
  if (!Array.isArray(posts)) throw new Error('Invalid judge.json: expected verdicts for the published drafts.');
  const verdicts = posts.map(record);
  return new Map<string, Judgement>(references.map(([key, observation]) => {
    const [channel, id] = JSON.parse(key) as [string, string];
    const matches = verdicts.filter(row => row.channel === channel && row.sourceHash === observation.judgeSourceHash &&
      row.rubricId === copyRubric.rubricId);
    if (matches.length !== 1) throw new Error(`No unique matching judge verdict for ${channel} post ${id}.`);
    const { aggregate, scores } = matches[0];
    const dimensions = record(scores);
    const valid = (value: unknown, max: number): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
    if (!valid(aggregate, 100) || !criteria.every(name => valid(dimensions[name], 10)))
      throw new Error(`Invalid judge scores for ${channel} post ${id}.`);
    return [key, { score: aggregate, dimensions: Object.fromEntries(criteria.map(name => [name, Number(dimensions[name]) * 10])) }];
  }));
}
