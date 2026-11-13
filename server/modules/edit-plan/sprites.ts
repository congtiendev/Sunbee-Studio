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

function cropTo(source: string, out: string, w: number, h: number, x: number, y: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-v", "error", "-i", source, "-vf", `crop=${w}:${h}:${x}:${y}`, "-frames:v", "1", out]);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg crop failed: ${err.trim()}`))));
  });
}

/**
 * The box (within a cell) that holds the subject in EVERY frame: the union
 * of each frame's non-transparent pixels, plus a small margin. Cropping all
 * frames to the same box keeps the subject's size true to its placement
 * (cells carry wide empty margins) without making frames jump around.
 * The whole cell when the sheet has no transparency to go by.
 */
async function subjectBox(
  source: { path: string; width: number; height: number },
  grid: SpriteGrid,
  cellW: number,
  cellH: number,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const whole = { x: 0, y: 0, w: cellW, h: cellH };
  let data: Buffer;
  try {
    data = await readRgba(source.path, source.width, source.height);
  } catch {
    return whole;
  }
  let left = cellW;
  let top = cellH;
  let right = -1;
  let bottom = -1;
  let transparent = false;
  for (let i = 0; i < grid.frames; i++) {
    const ox = (i % grid.cols) * cellW;
    const oy = Math.floor(i / grid.cols) * cellH;
    for (let y = 0; y < cellH; y += 2) {
      for (let x = 0; x < cellW; x += 2) {
        const alpha = data[((oy + y) * source.width + ox + x) * 4 + 3]!;
        if (alpha <= 8) {
          transparent = true;
          continue;
        }
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (!transparent || right < 0) return whole;
  const margin = Math.round(Math.min(cellW, cellH) * 0.02);
  const x = Math.max(0, left - margin);
  const y = Math.max(0, top - margin);
  return { x, y, w: Math.min(cellW, right + margin + 2) - x, h: Math.min(cellH, bottom + margin + 2) - y };
}

/**
 * Cuts a sheet into its frames (equal cells, row by row, each cropped to the
 * subject's common box), cached under `<dataDir>/cache/sprites/<key>/` so a
 * rebuild doesn't redo it.
 */
export async function spriteFrames(
  source: { path: string; width: number; height: number; cacheKey: string },
  grid: SpriteGrid,
): Promise<{ paths: string[]; width: number; height: number }> {
  const cellW = Math.floor(source.width / grid.cols);
  const cellH = Math.floor(source.height / grid.rows);
  const box = await subjectBox(source, grid, cellW, cellH);
  const dir = join(
    dataDir(),
    "cache",
    "sprites",
    `${source.cacheKey}_${grid.cols}x${grid.rows}_${box.x}-${box.y}-${box.w}x${box.h}`,
  );
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < grid.frames; i++) {
    const out = join(dir, `${i + 1}.png`);
    if (!existsSync(out)) {
      await cropTo(
        source.path,
        out,
        box.w,
        box.h,
        (i % grid.cols) * cellW + box.x,
        Math.floor(i / grid.cols) * cellH + box.y,
      );
    }
    paths.push(out);
  }
  return { paths, width: box.w, height: box.h };
}
