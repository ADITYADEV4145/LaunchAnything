const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function restrictions(rules: { short_name: string; description: string }[], timezone: string) {
  const text = rules.map(r => r.short_name + ' ' + r.description).join('\n').toLowerCase();
  const days = weekdays.flatMap((day, i) => new RegExp(`\\b${day}s?\\b`).test(text) ? [i] : []);
  if (/\bweekends?\b/.test(text)) days.push(0, 6);
  const clock = (hour: string, minute?: string, period?: string) => Number(hour) % (period ? 12 : 24) * 60 + Number(minute ?? 0) + (period === 'pm' ? 720 : 0);
  const range = /\b(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
  const at = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text);
  const start = range ? clock(range[1]!, range[2], range[3] ?? range[6]) : at ? clock(at[1]!, at[2], at[3]) : undefined;
  const end = range ? clock(range[4]!, range[5], range[6]) : start;
  const minutes = (start === undefined ? undefined : Math.min(1439, start));
  return { days: [...new Set(days)], megathread: /mega[- ]?thread/.test(text), start: minutes, end, timezone: /\b(?:utc|gmt)\b/.test(text) ? 'UTC' : timezone };
}
export function allowedDate(date: string, days: number[]) { return !days.length || days.includes(new Date(date + 'T12:00:00Z').getUTCDay()); }
export function nextDate(date: string) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
export function restrictionTime(start?: number) { return start === undefined ? undefined : `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`; }
