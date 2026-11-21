declare module 'gifenc' {
  const gifenc: { GIFEncoder: typeof GIFEncoder; quantize: typeof quantize; applyPalette: typeof applyPalette };
  export default gifenc;
  export function GIFEncoder(): { writeFrame(data: Uint8Array, width: number, height: number, options: { palette: number[][]; delay: number }): void; finish(): void; bytes(): Uint8Array };
  export function quantize(data: Uint8Array, count: number): number[][];
  export function applyPalette(data: Uint8Array, palette: number[][]): Uint8Array;
}
