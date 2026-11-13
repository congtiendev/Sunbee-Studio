import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "../../env.js";

/**
 * Sprite sheets: one image holding a subject's animation as a grid of frames
 * ("Sprite sheet 8 khung (4×2): …"). The edit plan plays them frame by frame,
 * so each sheet is cut into its frames once and cached.
 */

export interface SpriteGrid {
  cols: number;
  rows: number;
  /** Frames actually used (the last row may be partly empty). */
  frames: number;
}

export const isSpriteSheet = (description: string) => /sprite/i.test(description);

/** "8 khung (4×2)", "12 frames (4x3)" → the grid written in the description, if any. */
export function gridFromDescription(description: string): SpriteGrid | null {
  const grid = /(\d+)\s*[×xX*]\s*(\d+)/.exec(description);
  if (!grid) return null;
  const cols = Number(grid[1]);
  const rows = Number(grid[2]);
  if (!(cols >= 1 && rows >= 1 && cols * rows <= 64)) return null;
  const count = /(\d+)\s*(khung|frames?)/i.exec(description);
  const frames = count ? Math.min(cols * rows, Number(count[1])) : cols * rows;
  return { cols, rows, frames: Math.max(1, frames) };
}

/** RGBA pixels of an image via ffmpeg (no image library needed). */
function readRgba(path: string, width: number, height: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const data = Buffer.concat(chunks);
      if (code !== 0 || data.length < width * height * 4) reject(new Error(`ffmpeg can't read ${path}`));
      else resolve(data);
    });
  });
}

/** Number of content runs separated by fully transparent gaps along one axis. */
function runs(empty: boolean[]): number {
  let count = 0;
  let inside = false;
  for (const isEmpty of empty) {
    if (!isEmpty && !inside) count++;
    inside = !isEmpty;
  }
  return count;
}

/**
 * The grid read off the image itself: fully transparent columns/rows between
 * frames. Null when the sheet has no transparent gutters to go by.
 */
export async function gridFromImage(path: string, width: number, height: number): Promise<SpriteGrid | null> {
  const data = await readRgba(path, width, height);
  const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;
  const emptyCols = Array.from({ length: width }, (_, x) => {
    for (let y = 0; y < height; y += 2) if (alpha(x, y) > 8) return false;
    return true;
  });
  const emptyRows = Array.from({ length: height }, (_, y) => {
    for (let x = 0; x < width; x += 2) if (alpha(x, y) > 8) return false;
    return true;
  });
  const cols = runs(emptyCols);
  const rows = runs(emptyRows);
  if (cols * rows <= 1 || cols * rows > 64) return null;
  return { cols, rows, frames: cols * rows };
}

/** Writes RGBA pixels as a PNG (via ffmpeg, like the reads). */
function writePng(out: string, pixels: Buffer, width: number, height: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${width}x${height}`,
      "-i",
      "-",
      "-frames:v",
      "1",
      out,
    ]);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg png failed: ${err.trim()}`))));
    child.stdin.end(pixels);
  });
}

/** An inclusive pixel box within a cell. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One cell of a sheet: where its own drawing may be (`clip`) and what's drawn there (`box`, null when empty). */
interface Cell {
  clip: Box;
  box: Box | null;
}

/** Opaque enough to be drawing (not the soft fringe of a transparent background). */
const DRAWN = 8;
/** A strip at a cell's edge cut off from the rest by a clear gap, this thin or less, is a neighbour's spill. */
const SPILL_SHARE = 0.12;
/** Share of the subject's width that a straight cut must span to count as one (a bust's chest, not two feet). */
const CUT_EDGE_SHARE = 0.45;

/**
 * Where a cell's own drawing is: the whole cell minus any thin strip along an
 * edge that a fully clear row/column separates from the rest — the bottom of
 * the frame above, the hair of the one below, when the sheet's grid isn't
 * exactly even.
 */
function clipOf(has: (i: number) => boolean, length: number): [number, number] {
  const limit = Math.round(length * SPILL_SHARE);
  let from = 0;
  let to = length - 1;
  // From the start: drawing, then a gap, within the limit → skip past the gap.
  let i = 0;
  while (i < limit && !has(i)) i++;
  if (i < limit) {
    let j = i;
    while (j < limit && has(j)) j++;
    if (j < limit && !has(j)) from = j;
  }
  i = length - 1;
  while (i > length - 1 - limit && !has(i)) i--;
  if (i > length - 1 - limit) {
    let j = i;
    while (j > length - 1 - limit && has(j)) j--;
    if (j > length - 1 - limit && !has(j)) to = j;
  }
  return from < to ? [from, to] : [0, length - 1];
}

/**
 * Whether the subject ends in a straight cut at its bottom (a figure cut off at
 * the chest/waist, a hand coming up from below): its lowest row is one
 * unbroken run of opaque pixels spanning a good part of its width, about as
 * wide as a few rows higher — feet, a round object or a shadow aren't.
 */
function cutAtBottom(alpha: (x: number, y: number) => number, box: Box): boolean {
  const run = (y: number) => {
    let best = 0;
    let current = 0;
    for (let x = box.left; x <= box.right; x++) {
      if (alpha(x, y) > 128) best = Math.max(best, ++current);
      else current = 0;
    }
    return best;
  };
  const width = box.right - box.left + 1;
  const height = box.bottom - box.top + 1;
  if (height < 8) return false;
  // A pixel or two above the very last row: anti-aliasing can thin it.
  const edge = Math.max(run(box.bottom), run(box.bottom - 1));
  const above = run(Math.max(box.top, box.bottom - Math.round(height * 0.04) - 2));
  return edge >= width * CUT_EDGE_SHARE && edge >= above * 0.8;
}

/** Bump when the crop rules change, so cached frames are cut again. */
const CROP_VERSION = 3;

/**
 * Cuts a sheet into its frames (equal cells, row by row), each cropped tight to
 * the box that holds the subject in EVERY frame — so its size stays true to its
 * placement (cells carry wide empty margins) and frames don't jump around.
 * Anything a neighbouring cell spilled over the line is left out. A subject
 * cut off at the bottom (a bust) has each frame shifted so its cut is the
 * picture's last row: placed on the frame's bottom edge, it never shows a gap.
 * Cached under `<dataDir>/cache/sprites/<key>/` so a rebuild doesn't redo it.
 * A single picture is a 1×1 sheet: its transparent margins go the same way
 * (and with no transparency at all it's used as it is).
 */
export async function spriteFrames(
  source: { path: string; width: number; height: number; cacheKey: string },
  grid: SpriteGrid,
): Promise<{ paths: string[]; width: number; height: number; cutBottom: boolean }> {
  const single = grid.cols * grid.rows === 1;
  const asIs = { paths: [source.path], width: source.width, height: source.height, cutBottom: false };
  const cellW = Math.floor(source.width / grid.cols);
  const cellH = Math.floor(source.height / grid.rows);
  let data: Buffer;
  try {
    data = await readRgba(source.path, source.width, source.height);
  } catch {
    if (single) return asIs;
    throw new Error(`Can't read the sprite sheet ${source.path}`);
  }
  const origin = (i: number) => ({ ox: (i % grid.cols) * cellW, oy: Math.floor(i / grid.cols) * cellH });

  let transparent = false;
  let cuts = 0;
  const cells: Cell[] = [];
  for (let i = 0; i < grid.frames; i++) {
    const { ox, oy } = origin(i);
    const alpha = (x: number, y: number) => data[((oy + y) * source.width + ox + x) * 4 + 3]!;
    const rowHas = Array.from({ length: cellH }, (_, y) => {
      for (let x = 0; x < cellW; x++) if (alpha(x, y) > DRAWN) return true;
      return false;
    });
    const colHas = Array.from({ length: cellW }, (_, x) => {
      for (let y = 0; y < cellH; y++) if (alpha(x, y) > DRAWN) return true;
      return false;
    });
    if (rowHas.some((has) => !has) || colHas.some((has) => !has)) transparent = true;
    const [top, bottom] = clipOf((y) => rowHas[y]!, cellH);
    const [left, right] = clipOf((x) => colHas[x]!, cellW);
    const clip = { left, top, right, bottom };
    let box: Box | null = null;
    for (let y = clip.top; y <= clip.bottom; y++) {
      for (let x = clip.left; x <= clip.right; x++) {
        if (alpha(x, y) <= DRAWN) continue;
        if (!box) box = { left: x, top: y, right: x, bottom: y };
        else {
          if (x < box.left) box.left = x;
          if (x > box.right) box.right = x;
          if (y < box.top) box.top = y;
          if (y > box.bottom) box.bottom = y;
        }
      }
    }
    cells.push({ clip, box });
    if (box && cutAtBottom(alpha, box)) cuts++;
  }
  const drawn = cells.map((c) => c.box).filter((b): b is Box => b !== null);
  if (single && (!transparent || drawn.length === 0)) return asIs;
  // Most frames end in a straight cut: the subject is cut off at the bottom.
  const cutBottom = drawn.length > 0 && cuts * 2 > drawn.length;

  // The frame: tight around the subject in every frame (the whole cell when nothing's see-through).
  const left = drawn.length ? Math.min(...drawn.map((b) => b.left)) : 0;
  const right = drawn.length ? Math.max(...drawn.map((b) => b.right)) : cellW - 1;
  const top = drawn.length ? Math.min(...drawn.map((b) => b.top)) : 0;
  const bottom = drawn.length ? Math.max(...drawn.map((b) => b.bottom)) : cellH - 1;
  const w = right - left + 1;
  // Cut off at the bottom: tall enough for the tallest frame from its top down to its cut.
  const h = cutBottom ? Math.max(...drawn.map((b) => b.bottom - b.top + 1)) : bottom - top + 1;

  const dir = join(
    dataDir(),
    "cache",
    "sprites",
    `${source.cacheKey}_${grid.cols}x${grid.rows}_v${CROP_VERSION}_${left}-${top}-${w}x${h}${cutBottom ? "_cut" : ""}`,
  );
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < grid.frames; i++) {
    const out = join(dir, `${i + 1}.png`);
    if (!existsSync(out)) {
      const { ox, oy } = origin(i);
      const { clip, box } = cells[i]!;
      // Which cell row lands on the frame's first row: a cut-off subject's cut sits on the last row.
      const startY = cutBottom && box ? box.bottom + 1 - h : top;
      const pixels = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) {
        const cy = startY + y;
        if (cy < clip.top || cy > clip.bottom) continue;
        for (let x = 0; x < w; x++) {
          const cx = left + x;
          if (cx < clip.left || cx > clip.right) continue;
          const from = ((oy + cy) * source.width + ox + cx) * 4;
          data.copy(pixels, (y * w + x) * 4, from, from + 4);
        }
      }
      await writePng(out, pixels, w, h);
    }
    paths.push(out);
  }
  return { paths, width: w, height: h, cutBottom };
}
