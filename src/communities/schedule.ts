const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const zones: Record<string, string> = { et: 'America/New_York', est: 'Etc/GMT+5', edt: 'Etc/GMT+4', pt: 'America/Los_Angeles', pst: 'Etc/GMT+8', pdt: 'Etc/GMT+7', ct: 'America/Chicago', cst: 'Etc/GMT+6', cdt: 'Etc/GMT+5', mt: 'America/Denver', mst: 'Etc/GMT+7', mdt: 'Etc/GMT+6', utc: 'UTC', gmt: 'UTC' };
const unsupportedZones = ['cet', 'cest', 'eet', 'eest', 'ist', 'bst', 'jst', 'aest', 'aedt', 'acst', 'acdt', 'awst', 'nzst', 'nzdt', 'hkt', 'sgt', 'wet', 'west', 'ast', 'adt', 'hst', 'akst', 'akdt'];
const zonePattern = `(?:(?:utc|gmt)[ \\t]*[+-][ \\t]*\\d+(?::\\d{2})?|[a-z_]+(?:/[a-z0-9_+-]+)+|${[...Object.keys(zones), ...unsupportedZones].join('|')})`;
export function restrictions(rules: { short_name: string; description: string }[], timezone: string) {
  const text = rules.map(r => r.short_name + ' ' + r.description).join('\n').toLowerCase();
  const days = weekdays.flatMap((day, i) => new RegExp(`\\b${day}s?\\b`).test(text) ? [i] : []);
  if (/\bweekends?\b/.test(text)) days.push(0, 6);
  const clock = (hour: string, minute?: string, period?: string) => Number(hour) % (period ? 12 : 24) * 60 + Number(minute ?? 0) + (period === 'pm' ? 720 : 0);
  const range = [...text.matchAll(/\b(?:(?:between|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)].find(m =>
    m[2] !== undefined || m[3] !== undefined || m[5] !== undefined || m[6] !== undefined || /^between\b/.test(m[0]) ||
    new RegExp(`\\b${zonePattern}[ \\t]*$`).test(text.slice(0, m.index)) || new RegExp(`^[ \\t]*[(\\[]?[ \\t]*${zonePattern}\\b`).test(text.slice(m.index! + m[0].length)));
  const at = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text);
  const start = range ? clock(range[1]!, range[2], range[3] ?? range[6]) : at ? clock(at[1]!, at[2], at[3]) : undefined;
  const end = range ? clock(range[4]!, range[5], range[6]) : start;
  const mentions: string[] = [];
  let manualReview: string | undefined;
  for (const [zone] of text.matchAll(new RegExp(`(?<![\\w./:])${zonePattern}(?![\\w/])`, 'g'))) {
    if (zones[zone]) mentions.push(zones[zone]!);
    else if (zone.includes('/')) {
      try { mentions.push(new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone); }
      catch { manualReview = `Unrecognized rule timezone: ${zone}`; }
    } else manualReview = `Unrecognized rule timezone: ${zone}`;
  }
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
    const time = limit.start !== undefined || limit.timezone !== timezone ? restrictionTime(local.minute) : undefined;
    return { date: local.date, time, timezone, ...(time !== undefined ? { instant: new Date(instant).toISOString() } : {}) };
  }
  throw new Error('No valid rule time found; manual review required');
}
export function postingWindow(date: string, time: string | undefined, timezone: string, limit: Restriction, scheduledInstant?: string) {
  const validTime = time !== undefined && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  const minute = validTime ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : 720;
  const instant = scheduledInstant === undefined ? instantAt(date, minute, timezone) : Date.parse(scheduledInstant);
  if (limit.manualReview || instant === undefined || !Number.isFinite(instant)) return { day: false, time: false };
  const slot = localTime(instant, timezone);
  const local = localTime(instant, limit.timezone);
  const overnight = limit.start !== undefined && limit.end! < limit.start;
  const day = overnight && local.minute <= limit.end! ? nextDate(local.date, -1) : local.date;
  const inWindow = limit.start === undefined || (validTime && (overnight ? local.minute >= limit.start || local.minute <= limit.end! : local.minute >= limit.start && local.minute <= limit.end!));
  return { day: slot.date === date && allowedDate(day, limit.days), time: slot.date === date && (time === undefined || validTime && slot.minute === minute) && inWindow };
}
