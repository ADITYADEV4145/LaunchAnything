export interface Slot { channel: string; scheduledAt: string; local: string }

export function displayTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));
}

export function parseSchedule(markdown: string, timezone: string): Slot[] {
  const lines = markdown.split(/\r?\n/).map(line => line.trim());
  const cells = (line: string) => line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  const header = lines.findIndex(line => line.startsWith('|') &&
    ['Channel', 'Local date', 'Local time'].every(name => cells(line).includes(name)));
  if (header < 0) throw new Error('Schedule needs Channel, Local date, Local time columns');
  const columns = ['Channel', 'Local date', 'Local time'].map(name => cells(lines[header]).indexOf(name));
  const slots: Slot[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith('|')) break;
    const row = cells(line);
    if (row.every(cell => /^:?-+:?$/.test(cell))) continue;
    const [channel, date, time] = columns.map(index => row[index]);
    if (!channel || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(time ?? ''))
      throw new Error('Invalid schedule row: ' + row.join(' | '));
    if (slots.some(slot => slot.channel === channel)) throw new Error('Duplicate scheduled channel: ' + channel);
    const local = date + ' ' + time, nominal = Date.parse(date + 'T' + time + ':00Z');
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== date + 'T' + time)
      throw new Error('Invalid local schedule: ' + local);
    const candidates = [-24, 0, 24].map(hours => {
      const probe = nominal + hours * 3600000;
      return nominal - (Date.parse(displayTime(new Date(probe).toISOString(), timezone).replace(' ', 'T') + ':00Z') - probe);
    }).filter(ms => displayTime(new Date(ms).toISOString(), timezone) === local);
    if (!candidates.length) throw new Error('Schedule does not exist in ' + timezone + ': ' + local);
    slots.push({ channel, local: local + ' ' + timezone, scheduledAt: new Date(Math.min(...candidates)).toISOString() });
  }
  if (!slots.length) throw new Error('Schedule has no posts');
  return slots.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
