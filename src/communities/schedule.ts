const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const zones: Record<string, string> = { et: 'America/New_York', est: 'Etc/GMT+5', edt: 'Etc/GMT+4', pt: 'America/Los_Angeles', pst: 'Etc/GMT+8', pdt: 'Etc/GMT+7', ct: 'America/Chicago', cst: 'Etc/GMT+6', cdt: 'Etc/GMT+5', mt: 'America/Denver', mst: 'Etc/GMT+7', mdt: 'Etc/GMT+6', utc: 'UTC', gmt: 'UTC' };
export function restrictions(rules: { short_name: string; description: string }[], timezone: string) {
  const text = rules.map(r => r.short_name + ' ' + r.description).join('\n').toLowerCase();
  const days = weekdays.flatMap((day, i) => new RegExp(`\\b${day}s?\\b`).test(text) ? [i] : []);
  if (/\bweekends?\b/.test(text)) days.push(0, 6);
  const clock = (hour: string, minute?: string, period?: string) => Number(hour) % (period ? 12 : 24) * 60 + Number(minute ?? 0) + (period === 'pm' ? 720 : 0);
  const range = /\b(?:(?:between|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
  const at = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text);
  const start = range ? clock(range[1]!, range[2], range[3] ?? range[6]) : at ? clock(at[1]!, at[2], at[3]) : undefined;
  const end = range ? clock(range[4]!, range[5], range[6]) : start;
  const mentions = [...text.matchAll(/\b(?:e[ds]?t|p[ds]?t|c[ds]?t|m[ds]?t|utc|gmt)\b/g)].map(m => zones[m[0]]!);
  const time = range ?? at;
  const suffix = time ? /^\s*[(\[]?\s*(?:in\s+)?([a-z][a-z0-9_+\/-]*)/.exec(text.slice(time.index + time[0].length))?.[1] : undefined;
  let manualReview: string | undefined;
  if (suffix && !zones[suffix] && !/^(?:in|on|and|or|only|every|during|for|with|please|use|post|posts|within|the|this|via|daily|weekly)$/.test(suffix)) {
    try { new Intl.DateTimeFormat('en', { timeZone: suffix }); mentions.push(suffix); }
    catch { manualReview = `Unrecognized rule timezone: ${suffix}`; }
  }
  if (/\b(?:utc|gmt)\s*[+-]\s*\d/.test(text)) manualReview = 'Rule timezone offset needs manual review';
  const unsupported = /\b(?:cet|cest|eet|eest|ist|bst|jst|aest|aedt|acst|acdt|awst|nzst|nzdt|hkt|sgt|wet|west|ast|adt|hst|akst|akdt)\b/.exec(text);
  if (unsupported) manualReview = `Unrecognized rule timezone: ${unsupported[0]}`;
  if (new Set(mentions).size > 1) manualReview = 'Conflicting rule timezones';
  return { days: [...new Set(days)], megathread: /mega[- ]?thread/.test(text), start, end, timezone: mentions[0] ?? timezone, manualReview };
}
export function allowedDate(date: string, days: number[]) { return !days.length || days.includes(new Date(date + 'T12:00:00Z').getUTCDay()); }
export function nextDate(date: string, days = 1) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function restrictionTime(start?: number) { return start === undefined ? undefined : `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`; }
function localTime(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}
function instantAt(date: string, minute: number, timezone: string) {
  const target = Date.parse(`${date}T${restrictionTime(minute)}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const local = localTime(instant, timezone);
    const delta = target - Date.parse(`${local.date}T${restrictionTime(local.minute)}:00Z`);
    if (delta === 0) return instant;
    instant += delta;
  }
}
type Restriction = ReturnType<typeof restrictions>;
export function postingSlot(date: string, limit: Restriction, timezone: string) {
  if (limit.manualReview) throw new Error(limit.manualReview);
  for (let sourceDate = nextDate(date, -2), i = 0; i < 14; i++, sourceDate = nextDate(sourceDate)) {
    if (!allowedDate(sourceDate, limit.days)) continue;
    const instant = instantAt(sourceDate, limit.start ?? 720, limit.timezone);
    if (instant === undefined) continue;
    const local = localTime(instant, timezone);
    if (local.date < date) continue;
    return { date: local.date, time: limit.start !== undefined || limit.timezone !== timezone ? restrictionTime(local.minute) : undefined, timezone };
  }
  throw new Error('No valid rule time found; manual review required');
}
export function postingWindow(date: string, time: string | undefined, timezone: string, limit: Restriction) {
  const validTime = time !== undefined && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  const minute = validTime ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : 720;
  const instant = instantAt(date, minute, timezone);
  if (limit.manualReview || instant === undefined) return { day: false, time: false };
  const local = localTime(instant, limit.timezone);
  const overnight = limit.start !== undefined && limit.end! < limit.start;
  const day = overnight && local.minute <= limit.end! ? nextDate(local.date, -1) : local.date;
  const inWindow = limit.start === undefined || (validTime && (overnight ? local.minute >= limit.start || local.minute <= limit.end! : local.minute >= limit.start && local.minute <= limit.end!));
  return { day: allowedDate(day, limit.days), time: (time === undefined || validTime) && inWindow };
}
