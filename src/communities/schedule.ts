const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const zones: Record<string, string> = { et: 'America/New_York', est: 'Etc/GMT+5', edt: 'Etc/GMT+4', pt: 'America/Los_Angeles', pst: 'Etc/GMT+8', pdt: 'Etc/GMT+7', ct: 'America/Chicago', cst: 'Etc/GMT+6', cdt: 'Etc/GMT+5', mt: 'America/Denver', mst: 'Etc/GMT+7', mdt: 'Etc/GMT+6', utc: 'UTC', gmt: 'UTC' };
const unsupportedZones = ['cet', 'cest', 'eet', 'eest', 'ist', 'bst', 'jst', 'aest', 'aedt', 'acst', 'acdt', 'awst', 'nzst', 'nzdt', 'hkt', 'sgt', 'wet', 'west', 'ast', 'adt', 'hst', 'akst', 'akdt'];
const zonePattern = `(?:(?:utc|gmt)[ \\t]*[+-][ \\t]*\\d+(?::\\d{2})?|[a-z_]+(?:/[a-z0-9_+-]+)+|${[...Object.keys(zones), ...unsupportedZones].join('|')})`;
function unknownTimeContext(source: string) {
  const phrase = /\b(\p{L}[\p{L}\p{M}-]*)\s+time\b/iu.exec(source);
  if (phrase) return `Unrecognized rule timezone or place: ${phrase[1]}`;
  if (/\btime\s*zone\b/i.test(source)) return 'Unresolved rule timezone context';
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const known = new RegExp(`^(?:${zonePattern}|(?:${weekdays.join('|')})s?|weekends?|weekdays?|${months.concat(months.map(month => month.slice(0, 3))).join('|')})$`, 'i');
  for (const match of source.matchAll(/(?<![\p{L}\p{N}_])\p{L}[\p{L}\p{M}_/+\-]*/gu)) {
    if (!/^\p{Lu}/u.test(match[0]) || known.test(match[0])) continue;
    const prefix = source.slice(0, match.index).split(/[.!?\n]/).at(-1)!;
    if (/[\p{L}\p{N}]/u.test(prefix)) return `Unrecognized rule timezone or place: ${match[0]}`;
  }
}
function parseRestriction(rules: { short_name: string; description: string }[], timezone: string) {
  const raw = rules.flatMap(r => [r.short_name, r.description]).join('\n\n');
  const urlPattern = /\b(?:(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s<>]*)?)/gi;
  const threadUrls = [...new Set([...raw.matchAll(urlPattern)].filter(m => /mega[-_]?thread|weekly[-_/]|self[-_]promo|promo[-_]thread|reddit\.com\/r\/[^/]+\/comments\//i.test(m[0]) || /\bonly\s+in\s*$/i.test(raw.slice(0, m.index))).map(m => m[0].replace(/[).,;]+$/, '')))];
  const threadUrl = threadUrls.length === 1 && /^(?:https?:\/\/)?(?:(?:www|old)\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+(?:\/|$)/i.test(threadUrls[0]!) ? threadUrls[0] : undefined;
  const source = raw.replace(urlPattern, ' ')
    .replace(/(?<![\w/])\/?[ru]\/[\w-]+(?:\/[\w/-]+)?/gi, ' ');
  const text = source.replace(/[A-Z]/g, letter => letter.toLowerCase())
    .replace(/\b\d+\s*:\s*\d+\s+(?:contribution\s+)?ratio\b|\bratio(?:\s+of)?\s*:?\s*\d+\s*:\s*\d+\b|\b\d+\s*:\s*1\b/g, token => ' '.repeat(token.length));
  let manualReview: string | undefined;
  const dayToken = `(?:(?:${weekdays.join('|')})s?|weekends?|weekdays?)`;
  const dayList = `${dayToken}(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|(?:and|or)\\s+)${dayToken})*`;
  const dayNumbers = (value: string) => weekdays.flatMap((day, i) => new RegExp(`\\b${day}s?\\b`).test(value) || /\bweekends?\b/.test(value) && [0, 6].includes(i) || /\bweekdays?\b/.test(value) && i > 0 && i < 6 ? [i] : []);
  const positiveDays: number[][] = []; const excludedDays = new Set<number>();
  for (const clause of text.split(/[.;!?\n]+/)) {
    if (!new RegExp(`\\b${dayToken}\\b`).test(clause) && !/\b(?:any|every)\s+day\b/.test(clause)) continue;
    if (new RegExp(`\\b${dayToken}\\s*(?:[-–]|to|through)\\s*${dayToken}\\b`).test(clause)) manualReview = 'Unclear posting-day polarity';
    let negativeStart: number | undefined;
    const rest = clause.replace(new RegExp(`\\b(except(?:\\s+for)?|not\\s+on|no\\b[^.;!?\\n]*?\\bon|excluding|other\\s+than)\\s+(?:on\\s+)?(${dayList})\\b`, 'g'), (match, cue: string, list: string, offset: number) => {
      negativeStart ??= offset;
      if (/^no\b/.test(cue) && /\b(?:and|or|but|restrictions?|limits?|bans?)\b/.test(cue)) manualReview = 'Unclear posting-day polarity';
      for (const day of dayNumbers(list)) excludedDays.add(day);
      return ' '.repeat(match.length);
    });
    if (negativeStart !== undefined && /[\p{L}\p{N}/&]/u.test(rest.slice(negativeStart))) manualReview = 'Unclear posting-day polarity';
    if (/\b(?:not|no|except|excluding|other than|unless|without|never)\b/.test(rest)) manualReview = 'Unclear posting-day polarity';
    const positive = dayNumbers(rest); if (positive.length) positiveDays.push(positive);
  }
  const constrainedDays = positiveDays.length > 0 || excludedDays.size > 0;
  const days = constrainedDays ? weekdays.flatMap((_, i) => positiveDays.every(positive => positive.includes(i)) && !excludedDays.has(i) ? [i] : []) : [];
  if (constrainedDays && !days.length) manualReview = 'Conflicting posting days';
  const clock = (hour: string, minute?: string, period?: string) => {
    const h = Number(hour); const m = Number(minute ?? 0);
    if (h < (period ? 1 : 0) || h > (period ? 12 : 23) || m > 59) return undefined;
    return (period ? h % 12 : h) * 60 + m + (period === 'pm' ? 720 : 0);
  };
  const range = [...text.matchAll(/\b(?:(?:between|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)].find(m =>
    m[2] !== undefined || m[3] !== undefined || m[5] !== undefined || m[6] !== undefined || /^between\b/.test(m[0]) ||
    new RegExp(`\\b${zonePattern}[ \\t]*$`).test(text.slice(0, m.index)) || new RegExp(`^[ \\t]*[(\\[]?[ \\t]*${zonePattern}\\b`).test(text.slice(m.index! + m[0].length)));
  const at = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text);
  const start = range ? clock(range[1]!, range[2], range[3]) : at ? clock(at[1]!, at[2], at[3]) : undefined;
  const end = range ? range[4] === '24' && range[5] === '00' && !range[6] ? 1440 : clock(range[4]!, range[5], range[6]) : start;
  const mentions: string[] = [];
  for (const [zone] of text.matchAll(new RegExp(`(?<![\\w./:])${zonePattern}(?![\\w/])`, 'g'))) {
    if (zones[zone]) mentions.push(zones[zone]!);
    else if (zone.includes('/')) {
      try { mentions.push(new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone); }
      catch { manualReview = `Unrecognized rule timezone: ${zone}`; }
    } else manualReview = `Unrecognized rule timezone: ${zone}`;
  }
  if (new Set(mentions).size > 1) manualReview = 'Conflicting rule timezones';
  const parsed = range ?? at;
  const remainder = parsed ? text.slice(0, parsed.index) + ' ' + text.slice(parsed.index! + parsed[0].length) : text;
  const unparsedTime = /\b(?:\d{1,2}\s*(?::\d{2}\b|[ap]\.?m\b)|(?:from|between|at)\s+\d|\d{1,2}\s+(?:to|and)\s+\d{1,2}\b|\d+\s*(?:hours?|hrs?|minutes?|mins?)\b|noon\b|midnight\b|morning\b|afternoon\b|evening\b|night\b|(?:posting|business|office)\s+(?:hours?|window)\b|post\s+(?:at|from|between|during)\b)/.test(remainder) || Boolean(parsed && /\b(?:before|after|until|till|except|excluding)\s*$/.test(text.slice(0, parsed.index)));
  if (unparsedTime || parsed && (start === undefined || end === undefined || range && Boolean(range[3]) !== Boolean(range[6]))) manualReview = 'Unparsed or ambiguous posting time/window';
  if (parsed || unparsedTime) manualReview ??= unknownTimeContext(source);
  const threadMention = /\b(?:threads?|mega[-_\s]?threads?|weekly[-_\s]+posts?)\b/i;
  const megathread = threadUrls.length > 0 || threadMention.test(source);
  if (megathread) {
    const description = rules.map(rule => rule.description).join('\n').replace(urlPattern, url => threadUrls.includes(url.replace(/[).,;]+$/, '')) ? ' thread ' : ' ');
    const threadClauses = description.split(/[.;!?\n,]+|\b(?:and|but|however)\b/i).filter(clause => threadMention.test(clause));
    const promotion = /\b(?:self[-_\s]?promo(?:tion)?|promotions?|advertising|your\s+(?:projects?|products?)|launch(?:es)?|showcases?|show\s+off)\b/i;
    const otherContent = /\b(?:jobs?|hiring|recruiting|recruitment|questions?|memes?|help|support|bug\s+reports?|feature\s+requests?|surveys?|polls?|classifieds|except|everything\s+else)\b/i;
    if (otherContent.test(raw.replace(/[_-]/g, ' ')) || !threadClauses.length || threadClauses.some(clause => !promotion.test(clause))) manualReview ??= 'Ambiguous thread scope; manual review required';
  }
  if (threadUrls.length && !threadUrl) manualReview = 'Unresolved thread destination; manual review required';
  return { days, megathread, threadUrl, start, end, timezone: mentions[0] ?? timezone, manualReview, explicitTimezone: mentions.length > 0, source, hasTime: Boolean(parsed || unparsedTime) };
}
export function restrictions(rules: { short_name: string; description: string }[], timezone: string) {
  let limits = rules.map(rule => parseRestriction([rule], timezone));
  const explicitZones = [...new Set(limits.filter(limit => limit.explicitTimezone).map(limit => limit.timezone))];
  const zone = explicitZones[0] ?? timezone;
  if (zone !== timezone) limits = rules.map(rule => parseRestriction([rule], zone));
  let manualReview = limits.find(limit => limit.manualReview)?.manualReview;
  if (explicitZones.length > 1) manualReview = 'Conflicting rule timezones';
  if (limits.some(limit => limit.hasTime)) manualReview ??= unknownTimeContext(limits.map(limit => limit.source).join('\n\n'));
  const dayLimits = limits.filter(limit => limit.days.length);
  const days = dayLimits.length ? weekdays.flatMap((_, day) => dayLimits.every(limit => limit.days.includes(day)) ? [day] : []) : [];
  if (dayLimits.length && !days.length) manualReview = 'Conflicting posting days';
  const windows = [...new Map(limits.flatMap(limit => limit.start === undefined || limit.end === undefined ? [] : [[`${limit.start}:${limit.end}`, { start: limit.start, end: limit.end }] as const])).values()];
  let start = windows[0]?.start; let end = windows[0]?.end;
  if (windows.length > 1) {
    if (windows.some(window => window.end < window.start)) manualReview = 'Multiple overnight windows need manual review';
    else {
      start = Math.max(...windows.map(window => window.start)); end = Math.min(...windows.map(window => window.end));
      if (start > end) manualReview = 'Conflicting posting windows';
    }
  }
  const threadUrls = [...new Set(limits.flatMap(limit => limit.threadUrl ? [limit.threadUrl] : []))];
  if (threadUrls.length > 1) manualReview = 'Conflicting thread destinations';
  return { days, megathread: limits.some(limit => limit.megathread), threadUrl: threadUrls[0], start, end, timezone: zone, manualReview };
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
