export const purposes = ['hook', 'before', 'action', 'after', 'proof', 'cta'] as const;
export function storyboardErrors(data: unknown): string[] {
  const shots = (data as { shots?: Record<string, unknown>[] })?.shots;
  if (!Array.isArray(shots)) return [];
  const errors: string[] = [];
  for (const shot of shots) {
    if (!shot || typeof shot !== 'object') continue;
    const values = [shot.route, ...(Array.isArray(shot.commands) ? shot.commands : []), ...(Array.isArray(shot.setup) ? shot.setup : [])];
    if (values.some(value => typeof value === 'string' && /\bTODO\b/i.test(value))) errors.push(`Shot ${shot.id}: TODO command/route; fill it from the repo before running liftoff shots.`);
  }
  if (!shots.some(shot => shot?.purpose !== undefined)) return errors;
  if (shots.length < 4 || shots.length > 8) errors.push('Storyboard must contain 4–8 shots');
  if (shots.filter(shot => shot?.moneyMoment === true).length !== 1) errors.push('Storyboard must have exactly one moneyMoment');
  let previous = -1;
  for (const shot of shots) {
    const rank = purposes.indexOf(shot?.purpose as typeof purposes[number]);
    if (rank < 0 || rank < previous) errors.push('Storyboard purposes must follow hook → before → action → after → proof → cta order');
    previous = rank;
  }
  return errors;
}
