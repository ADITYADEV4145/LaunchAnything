import { readFile } from 'node:fs/promises';
export const platforms = {
  og: { width: 1200, height: 630, limit: 8 },
  'product-hunt': { width: 1270, height: 760, limit: 3 },
  x: { width: 1600, height: 900, limit: 5 },
  linkedin: { width: 1200, height: 627, limit: 5 },
  instagram: { width: 1080, height: 1350, limit: 8 },
  youtube: { width: 1280, height: 720, limit: 2 },
} as const;
export type Size = keyof typeof platforms;
export function pngSize(data: Buffer) {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
export function compositeColor(foreground: number[], background: number[]): number[] {
  const alpha = foreground[3] ?? 1;
  return foreground.slice(0, 3).map((channel, i) => channel * alpha + background[i] * (1 - alpha));
}
export function contrast(a: number[], b: number[], base = [255, 255, 255]) {
  const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = compositeColor(b, base);
  const x = luminance(compositeColor(a, background)), y = luminance(background); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function safeArea(box: { x: number; y: number; width: number; height: number }, width: number, height: number, youtube = false) {
  return box.width > 0 && box.height > 0 && box.x >= width * .05 && box.y >= height * .05 && box.x + box.width <= width * .95 && box.y + box.height <= height * .95 && !(youtube && box.x + box.width > width * .8 && box.y + box.height > height * .85);
}
export async function checkImage(file: string, size: Size, headline: { box: { x: number; y: number; width: number; height: number }; foreground: number[]; background: number[] }) {
  const bytes = await readFile(file); const actual = pngSize(bytes); const expected = platforms[size];
  const checks = { dimensions: actual.width === expected.width && actual.height === expected.height, safeArea: safeArea(headline.box, expected.width, expected.height, size === 'youtube'), contrast: contrast(headline.foreground, headline.background) >= 4.5, fileSize: bytes.length < expected.limit * 1024 * 1024 };
  return { size, ...actual, bytes: bytes.length, contrastRatio: contrast(headline.foreground, headline.background), checks, ok: Object.values(checks).every(Boolean) };
}
