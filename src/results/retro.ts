import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { optionalText } from '../launch-ops/common.js';
import { checked, readJson, writeLocal } from './files.js';
import { learn } from './history.js';
import { addMetric, metricNames, type Results } from './metrics.js';

export function parseTargets(brief: string) {
  const targets: Partial<Record<typeof metricNames[number], number>> = {};
  let active = false, depth = 0;
  for (const line of brief.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (/success metrics/i.test(heading[2])) { active = true; depth = heading[1].length; }
      else if (heading[1].length <= depth) active = false;
      continue;
    }
    if (!active || !/^\s*[-*+]\s/.test(line)) continue;
    const name = line.match(/\b(views|likes|comments|clicks|signups|stars)\b/i)?.[1]?.toLowerCase();
    const number = line.match(/\b\d[\d,]*(?:\.\d+)?\b/);
    if (name && number) {
      const value = Number(number[0].replaceAll(',', ''));
      if (Number.isSafeInteger(value)) targets[name === 'stars' ? 'starsDelta' : name as typeof metricNames[number]] = value;
    }
  }
  return targets;
}
export async function retro(cwd: string, historyPath?: string) {
  const paths = launchDir(cwd), results = checked<Results>('results', await readJson(paths.results));
  const targets = parseTargets(await optionalText(join(paths.root, 'brief.md')));
  const rows = metricNames.filter(name => targets[name] !== undefined).map(name => {
    const values = results.channels.flatMap(row => row[name] === undefined ? [] : [row[name]!]);
    const actual = values.length ? values.reduce((sum, value) => addMetric(sum, value), 0) : undefined;
    return { metric: name, target: targets[name]!, actual, status: actual === undefined ? 'unreported' : actual >= targets[name]! ? 'met' : 'missed' };
  });
  const markdown = ['# Launch retrospective', '', 'Reported observations only; no causal conclusions.', '',
    '| Metric | Target | Actual | Status |', '| --- | ---: | ---: | --- |',
    ...rows.map(row => `| ${row.metric} | ${row.target} | ${row.actual ?? 'unreported'} | ${row.status} |`),
    ...(rows.length ? [] : ['No targets found in brief.md success metrics section.']), ''].join('\n');
  const learned = await learn(cwd, historyPath);
  const path = join(paths.root, 'retro.md');
  await writeLocal(path, markdown);
  return { path, rows, history: learned.path, lessons: learned.observations.length };
}
