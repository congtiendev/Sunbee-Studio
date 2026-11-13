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
  const count = /(\d+)\s*(khung|frames?|ô)/i.exec(description);
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

/** Which sides of a picture are a straight cut (the subject continues past the frame there). */
export interface CutSides {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/** What the caller knows about the subject from its words. */
export interface FrameHints {
  /** A character: its frames are lined up on its head (AI sheets draw it a little off from cell to cell). */
  character?: boolean;
  /** Said to be cut off at the bottom ("trung cảnh ngang hông"): its frames share one bottom line even when a hand hangs lower. */
  bust?: boolean;
}

/** Opaque enough to be drawing (not the soft fringe of a transparent background). */
const DRAWN = 8;
/** A strip at a cell's edge cut off from the rest by a clear gap, this thin or less, is a neighbour's spill. */
const SPILL_SHARE = 0.12;
/** Share of a side that a straight cut must span to count as one (a bust's chest, not two feet). */
const CUT_EDGE_SHARE = 0.45;
/** A character drawn this far off between frames is a drawing wobble, lined up; further is real movement, left alone. */
const WOBBLE_SHARE = 0.1;

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

/** Longest unbroken run of solid pixels along a line. */
function longestRun(solid: (k: number) => boolean, from: number, to: number): number {
  let best = 0;
  let current = 0;
  for (let k = from; k <= to; k++) {
    if (solid(k)) best = Math.max(best, ++current);
    else current = 0;
  }
  return best;
}

/**
 * Which sides of the subject are a straight cut: its outermost line there is
 * one unbroken run of solid pixels spanning a good part of that side, about as
 * long as a few lines further in — feet, a round head or a shadow aren't.
 */
function cutSidesOf(alpha: (x: number, y: number) => number, box: Box): CutSides {
  const solid = (x: number, y: number) => alpha(x, y) > 128;
  const width = box.right - box.left + 1;
  const height = box.bottom - box.top + 1;
  const inset = (n: number) => Math.round(n * 0.04) + 2;
  const row = (y: number) => longestRun((x) => solid(x, y), box.left, box.right);
  const col = (x: number) => longestRun((y) => solid(x, y), box.top, box.bottom);
  const cut = (edge: number, inner: number, length: number) => edge >= length * CUT_EDGE_SHARE && edge >= inner * 0.8;
  if (width < 8 || height < 8) return { top: false, bottom: false, left: false, right: false };
  return {
    // A pixel or two in from the very edge: anti-aliasing can thin it.
    bottom: cut(Math.max(row(box.bottom), row(box.bottom - 1)), row(box.bottom - inset(height)), width),
    top: cut(Math.max(row(box.top), row(box.top + 1)), row(box.top + inset(height)), width),
    left: cut(Math.max(col(box.left), col(box.left + 1)), col(box.left + inset(width)), height),
    right: cut(Math.max(col(box.right), col(box.right - 1)), col(box.right - inset(width)), height),
  };
}

/** Horizontal middle of the subject's head: the drawing in the top quarter of its box. */
function headCenter(alpha: (x: number, y: number) => number, box: Box): number {
  const rows = Math.max(1, Math.round((box.bottom - box.top + 1) * 0.25));
  let sum = 0;
  let count = 0;
  for (let y = box.top; y < box.top + rows; y++) {
    for (let x = box.left; x <= box.right; x++) {
      if (alpha(x, y) > 128) {
        sum += x;
        count++;
      }
    }
  }
  return count ? sum / count : (box.left + box.right) / 2;
}

/**
 * The body's cut line: the lowest row (up from the bottom, within its lower
 * 40%) drawn solid across a good part of its width — a hand hanging lower is
 * narrower, and goes past the frame's edge like it would in a real shot.
 */
function cutLineOf(alpha: (x: number, y: number) => number, box: Box): number {
  const width = box.right - box.left + 1;
  const stop = box.bottom - Math.round((box.bottom - box.top + 1) * 0.4);
  for (let y = box.bottom; y >= stop; y--) {
    if (longestRun((x) => alpha(x, y) > 128, box.left, box.right) >= width * CUT_EDGE_SHARE) return y;
  }
  return box.bottom;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Bump when the crop rules change, so cached frames are cut again. */
const CROP_VERSION = 4;

/**
 * Cuts a sheet into its frames (equal cells, row by row) and crops them tight
 * to the subject — its size stays true to its placement (cells carry wide
 * empty margins). Anything a neighbouring cell spilled over the line is left
 * out. A character's frames are lined up on its head (and, cut off at the
 * bottom, on its cut), since AI sheets draw it a little off from cell to cell
 * — played in turn, that reads as jitter; bigger moves (standing up) are kept.
 * A subject cut off at the bottom (from its pixels, or `hints.bust`) has every
 * frame's lowest line on the picture's last row: placed on the frame's bottom
 * edge, it never shows a gap. Cached under `<dataDir>/cache/sprites/<key>/`
 * so a rebuild doesn't redo it. A single picture is a 1×1 sheet (with no
 * transparency at all it's used as it is).
 */
export async function spriteFrames(
  source: { path: string; width: number; height: number; cacheKey: string },
  grid: SpriteGrid,
  hints: FrameHints = {},
): Promise<{ paths: string[]; width: number; height: number; cut: CutSides; cutBottom: boolean }> {
  const none: CutSides = { top: false, bottom: false, left: false, right: false };
  const single = grid.cols * grid.rows === 1;
  const asIs = { paths: [source.path], width: source.width, height: source.height, cut: none, cutBottom: false };
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
  const frames: { clip: Box; box: Box | null; cut: CutSides; head: number; cutLine: number }[] = [];
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
    frames.push({
      clip,
      box,
      cut: box ? cutSidesOf(alpha, box) : none,
      head: box ? headCenter(alpha, box) : 0,
      cutLine: box ? cutLineOf(alpha, box) : 0,
    });
  }
  const drawn = frames.filter((f) => f.box !== null);
  if (single && (!transparent || drawn.length === 0)) return asIs;
  // A side is cut when most frames say so.
  const majority = (side: keyof CutSides) => drawn.length > 0 && drawn.filter((f) => f.cut[side]).length * 2 > drawn.length;
  const cut: CutSides = { top: majority("top"), bottom: majority("bottom"), left: majority("left"), right: majority("right") };
  // Straight on both opposite sides is a shape (a card, a screen, a framed photo), not a cut.
  if (cut.top && cut.bottom) cut.top = cut.bottom = false;
  if (cut.left && cut.right) cut.left = cut.right = false;
  const alignBottom = cut.bottom || hints.bust === true;

  // Each frame's shift onto the others: the head's middle and (cut off) the bottom line, or (whole) the head's top.
  const shifts = frames.map(() => ({ dx: 0, dy: 0 }));
  if (drawn.length > 1) {
    const refX = median(drawn.map((f) => f.head));
    const refY = alignBottom ? median(drawn.map((f) => f.cutLine)) : median(drawn.map((f) => f.box!.top));
    frames.forEach((f, i) => {
      if (!f.box) return;
      const dx = Math.round(refX - f.head);
      const dy = Math.round(refY - (alignBottom ? f.cutLine : f.box.top));
      // Line up a character's wobble; a cut line always; anything else (or a real move) stays as drawn.
      if (hints.character && Math.abs(dx) <= cellW * WOBBLE_SHARE) shifts[i]!.dx = dx;
      if (alignBottom || (hints.character && Math.abs(dy) <= cellH * WOBBLE_SHARE)) shifts[i]!.dy = dy;
    });
  }
  // The picture: every frame's subject, shifted, in one box.
  const placed = frames.map((f, i) =>
    f.box
      ? {
          left: f.box.left + shifts[i]!.dx,
          right: f.box.right + shifts[i]!.dx,
          top: f.box.top + shifts[i]!.dy,
          bottom: f.box.bottom + shifts[i]!.dy,
        }
      : null,
  );
  const boxes = placed.filter((b): b is Box => b !== null);
  const left = boxes.length ? Math.min(...boxes.map((b) => b.left)) : 0;
  const right = boxes.length ? Math.max(...boxes.map((b) => b.right)) : cellW - 1;
  const top = boxes.length ? Math.min(...boxes.map((b) => b.top)) : 0;
  // Cut off at the bottom: the shared cut line is the last row (a hand lower than it goes past the edge).
  const bottom =
    alignBottom && drawn.length
      ? median(drawn.map((f) => f.cutLine))
      : boxes.length
        ? Math.max(...boxes.map((b) => b.bottom))
        : cellH - 1;
  const w = right - left + 1;
  const h = bottom - top + 1;

  const tag = `${alignBottom ? "b" : ""}${hints.character ? "c" : ""}`;
  const dir = join(
    dataDir(),
    "cache",
    "sprites",
    `${source.cacheKey}_${grid.cols}x${grid.rows}_v${CROP_VERSION}_${left}-${top}-${w}x${h}${tag ? `_${tag}` : ""}`,
  );
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < grid.frames; i++) {
    const out = join(dir, `${i + 1}.png`);
    if (!existsSync(out)) {
      const { ox, oy } = origin(i);
      const { clip } = frames[i]!;
      const { dx, dy } = shifts[i]!;
      const pixels = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) {
        const cy = top + y - dy;
        if (cy < clip.top || cy > clip.bottom) continue;
        for (let x = 0; x < w; x++) {
          const cx = left + x - dx;
          if (cx < clip.left || cx > clip.right) continue;
          const from = ((oy + cy) * source.width + ox + cx) * 4;
          data.copy(pixels, (y * w + x) * 4, from, from + 4);
        }
      }
      await writePng(out, pixels, w, h);
    }
    paths.push(out);
  }
  return { paths, width: w, height: h, cut, cutBottom: alignBottom };
}

/**
 * The icons of a sticker sheet ("Sticker sheet 9 ô (3×3): …"), each cell cut
 * on its own and cropped tight to its drawing (stickers differ in shape, so
 * unlike a sprite's frames they don't share one box). Empty cells come back as
 * null. Cached like sprite frames.
 */
export async function stickerCells(
  source: { path: string; width: number; height: number; cacheKey: string },
  grid: SpriteGrid,
): Promise<({ path: string; width: number; height: number } | null)[]> {
  const cellW = Math.floor(source.width / grid.cols);
  const cellH = Math.floor(source.height / grid.rows);
  const data = await readRgba(source.path, source.width, source.height);
  const dir = join(dataDir(), "cache", "sprites", `${source.cacheKey}_cells${grid.cols}x${grid.rows}_v${CROP_VERSION}`);
  await mkdir(dir, { recursive: true });
  const cells: ({ path: string; width: number; height: number } | null)[] = [];
  for (let i = 0; i < grid.frames; i++) {
    const ox = (i % grid.cols) * cellW;
    const oy = Math.floor(i / grid.cols) * cellH;
    const alpha = (x: number, y: number) => data[((oy + y) * source.width + ox + x) * 4 + 3]!;
    const rowHas = (y: number) => {
      for (let x = 0; x < cellW; x++) if (alpha(x, y) > DRAWN) return true;
      return false;
    };
    const colHas = (x: number) => {
      for (let y = 0; y < cellH; y++) if (alpha(x, y) > DRAWN) return true;
      return false;
    };
    const [top, bottom] = clipOf(rowHas, cellH);
    const [left, right] = clipOf(colHas, cellW);
    let box: Box | null = null;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
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
    if (!box) {
      cells.push(null);
      continue;
    }
    const w = box.right - box.left + 1;
    const h = box.bottom - box.top + 1;
    const out = join(dir, `${i + 1}.png`);
    if (!existsSync(out)) {
      const pixels = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) {
        const from = ((oy + box.top + y) * source.width + ox + box.left) * 4;
        data.copy(pixels, y * w * 4, from, from + w * 4);
      }
      await writePng(out, pixels, w, h);
    }
    cells.push({ path: out, width: w, height: h });
  }
  return cells;
}
