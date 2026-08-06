declare module "gifenc" {
  type Palette = number[][];
  type GifEncoder = {
    writeFrame: (index: Uint8Array, width: number, height: number, options: { palette?: Palette; delay?: number; repeat?: number }) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string }): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
}
