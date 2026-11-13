import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VideoMeasurements } from "./measure.js";

/**
 * The pictures an AI needs to read a sample video's editing — as a few
 * contact sheets (each one image) rather than hundreds of frames:
 * an overview of the shots, two long shots sampled densely (what happens
 * inside a shot), and 30 fps strips around reveals and cuts (how things
 * come on screen, what a cut looks like).
 */
export interface StyleSheet {
  /** What the sheet shows, told to the AI next to it. */
  caption: string;
  dataUrl: string;
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err.trim()}`))));
  });
}

async function asDataUrl(path: string): Promise<string> {
  return `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;
}

/** Single frames at `times`, tiled `cols`×`rows` into one JPEG. */
async function tileOf(video: string, times: number[], cols: number, rows: number, width: number, dir: string, name: string): Promise<string> {
  const frames = join(dir, name);
  await mkdir(frames, { recursive: true });
  for (const [i, t] of times.entries()) {
    await ffmpeg(["-ss", t.toFixed(3), "-i", video, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", join(frames, `${String(i + 1).padStart(3, "0")}.jpg`)]);
  }
  const out = join(dir, `${name}.jpg`);
  await ffmpeg(["-i", join(frames, "%03d.jpg"), "-vf", `tile=${cols}x${rows}:padding=4:color=white`, "-frames:v", "1", "-q:v", "4", out]);
  return out;
}

/** 24 consecutive frames (0.8 s at 30 fps) from `start`, tiled 8×3. */
async function stripOf(video: string, start: number, dir: string, name: string): Promise<string> {
  const out = join(dir, `${name}.jpg`);
  await ffmpeg([
    "-ss", Math.max(0, start).toFixed(3), "-t", "0.8", "-i", video,
    "-vf", "fps=30,scale=240:-2,tile=8x3:padding=3:color=white",
    "-frames:v", "1", "-q:v", "4", out,
  ]);
  return out;
}

/** Evenly picks `count` items, spread over the whole list. */
const spread = <T>(items: T[], count: number) =>
  items.length <= count ? items : Array.from({ length: count }, (_, i) => items[Math.floor(((i + 0.5) * items.length) / count)]!);

export async function styleSheets(video: string, m: VideoMeasurements, dir: string): Promise<StyleSheet[]> {
  const bounds = [0, ...m.cuts, m.durationSec];
  const shots = bounds.slice(1).map((end, i) => ({ start: bounds[i]!, end }));
  const sheets: StyleSheet[] = [];

  const mids = spread(shots, 24).map((s) => (s.start + s.end) / 2);
  sheets.push({
    caption: "Tổng quan: khung giữa của 24 shot rải đều cả video (đọc theo hàng, trái sang phải).",
    dataUrl: await asDataUrl(await tileOf(video, mids, 6, 4, 320, dir, "overview")),
  });

  const longest = [...shots].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 2);
  for (const [i, shot] of longest.entries()) {
    const times = Array.from({ length: 12 }, (_, k) => shot.start + 0.1 + ((shot.end - shot.start - 0.2) * k) / 11);
    sheets.push({
      caption: `Bên trong một shot dài (${(shot.end - shot.start).toFixed(1)} giây): 12 khung đều nhau từ đầu đến cuối shot — xem cái gì xuất hiện/thay đổi/chuyển động TRONG shot, máy quay có di chuyển không.`,
      dataUrl: await asDataUrl(await tileOf(video, times, 6, 2, 320, dir, `inside-${i + 1}`)),
    });
  }

  for (const [i, t] of spread(m.reveals, 2).entries()) {
    sheets.push({
      caption: "Chuỗi 24 khung liên tiếp (30 khung/giây) quanh lúc một phần tử mới xuất hiện giữa shot — xem nó vào khung bằng hiệu ứng gì và mất bao nhiêu khung.",
      dataUrl: await asDataUrl(await stripOf(video, t - 0.25, dir, `reveal-${i + 1}`)),
    });
  }
  for (const [i, t] of spread(m.cuts, 2).entries()) {
    sheets.push({
      caption: "Chuỗi 24 khung liên tiếp (30 khung/giây) quanh một điểm chuyển shot — xem là cắt thẳng hay có chuyển cảnh (mờ, trượt, zoom…), và cái gì xuất hiện ngay sau đó.",
      dataUrl: await asDataUrl(await stripOf(video, t - 0.2, dir, `cut-${i + 1}`)),
    });
  }
  return sheets;
}
