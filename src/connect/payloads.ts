export interface InstagramInput { gallery: string[]; verticalVideo: string; caption: string; hashtags: string[]; coverFrame: number }
export function instagramPayload(input: InstagramInput) {
  if (!input.gallery.length || !input.verticalVideo || !Number.isFinite(input.coverFrame) || input.coverFrame < 0)
    throw new Error('Instagram requires gallery images, a 9:16 video and a cover frame');
  return { carousel: { images: input.gallery }, reel: { video: input.verticalVideo, aspectRatio: '9:16', coverFrame: input.coverFrame },
    caption: input.caption, firstComment: input.hashtags.map(tag => '#' + tag.replace(/^#/, '')).join(' ') };
}
export interface ProductHuntInput { name: string; tagline: string; description: string; gallery: string[]; video?: string; makerComment: string; date: string }
export function productHuntPayload(input: ProductHuntInput) {
  if (!input.name.trim() || !input.tagline.trim() || !input.description.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw new Error('Product Hunt requires name, tagline, description and launch date');
  return { ...input, launchAt: `${input.date}T00:01:00`, timezone: 'America/Los_Angeles' };
}
const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
export function assistedReminder(channel: string, scheduledAt: string, date?: string) {
  const start = channel === 'product-hunt'
    ? `DTSTART;TZID=America/Los_Angeles:${date!.replaceAll('-', '')}T000100`
    : `DTSTART:${scheduledAt.replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Liftoff//Assisted launch//EN', 'BEGIN:VEVENT',
    `UID:${channel}-${scheduledAt}@liftoff.local`, `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    start, `SUMMARY:Open and fill ${channel}`, `DESCRIPTION:${escape(`liftoff publish --confirm --assist ${channel}`)}`,
    ...(channel === 'product-hunt' ? ['-PT24H', '-PT1H'] : ['PT0S']).flatMap(trigger =>
      ['BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:Open and fill ${channel}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
