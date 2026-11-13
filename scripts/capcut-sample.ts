// Writes a small sample CapCut project to check the writer in a real CapCut:
// a 16:9 background zooming in, a SQUARE background (cover-cropped) panning,
// a transparent cutout fading/scaling in on a layer above, a tone as the
// voice, and three subtitles (two overlapping, to check they get trimmed).
//
//   npx tsx scripts/capcut-sample.ts                 → into CapCut's draft folder
//   npx tsx scripts/capcut-sample.ts --to <folder>   → anywhere else (dry run)
//
// Then quit CapCut completely, reopen it and open the "sunbee_mau_…" project.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SUBTITLE_STYLE,
  IDENTITY_TRANSFORM,
  TIMELINE_CANVAS,
  TIMELINE_VERSION,
  type Timeline,
} from "../shared/timeline.js";
import { writeCapcutDraft } from "../server/services/capcut/writer.js";

const toIndex = process.argv.indexOf("--to");
const draftsRoot = toIndex > 0 ? process.argv[toIndex + 1] : undefined;
if (draftsRoot) mkdirSync(draftsRoot, { recursive: true });

const dir = join(tmpdir(), "sunbee-capcut-sample");
mkdirSync(dir, { recursive: true });
const ffmpeg = (...args: string[]) => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
};
const bgWide = join(dir, "bg-wide.png");
const bgSquare = join(dir, "bg-square.png");
const cutout = join(dir, "cutout.png");
const voice = join(dir, "voice.mp3");
ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1920x1080", "-frames:v", "1", bgWide);
ffmpeg("-f", "lavfi", "-i", "mandelbrot=size=1024x1024", "-frames:v", "1", bgSquare);
ffmpeg(
  "-f", "lavfi", "-i", "color=c=black@0:s=400x400,format=rgba",
  "-vf", "geq=r=255:g=190:b=0:a='if(lt(hypot(X-200,Y-200),180),255,0)'",
  "-frames:v", "1", cutout,
);
ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=8", voice);

const timeline: Timeline = {
  version: TIMELINE_VERSION,
  videoId: "sample",
  name: "Mẫu Sunbee",
  canvas: { ratio: "16:9", ...TIMELINE_CANVAS["16:9"], fps: 30 },
  durationMs: 8000,
  media: [
    { id: "bg-wide", kind: "image", path: bgWide },
    { id: "bg-square", kind: "image", path: bgSquare },
    { id: "cutout", kind: "image", path: cutout, hasAlpha: true },
    { id: "voice", kind: "audio", path: voice, durationMs: 8000 },
  ],
  visual: [
    {
      id: "shot1", mediaId: "bg-wide", role: "background", layer: 0, fit: "cover",
      startMs: 0, durationMs: 4000, transform: IDENTITY_TRANSFORM,
      // zoom: push in 7%
      keyframes: [{ atMs: 0, scale: 1 }, { atMs: 4000, scale: 1.07 }],
    },
    {
      id: "shot2", mediaId: "bg-square", role: "background", layer: 0, fit: "cover",
      startMs: 4000, durationMs: 4000, transform: { ...IDENTITY_TRANSFORM, scale: 1.08 },
      // pan right inside the 8% zoom's spare room
      keyframes: [{ atMs: 0, x: 0.048, scale: 1.08 }, { atMs: 4000, x: -0.048, scale: 1.08 }],
    },
    {
      id: "cutout1", mediaId: "cutout", role: "cutout", layer: 1, fit: "none",
      startMs: 1000, durationMs: 6000, transform: { ...IDENTITY_TRANSFORM, x: 0.5, y: -0.3 },
      // fades and grows in (eased), then holds
      keyframes: [
        { atMs: 0, opacity: 0, scale: 0.6 },
        { atMs: 800, opacity: 1, scale: 1, easing: "easeOut" },
      ],
    },
  ],
  audio: [
    { id: "voice1", mediaId: "voice", role: "voice", startMs: 0, durationMs: 8000, sourceStartMs: 0, volume: 1, fadeInMs: 300, fadeOutMs: 500 },
  ],
  subtitles: [
    { id: "s1", startMs: 0, durationMs: 3000, text: "Xin chào, đây là bản nháp mẫu của Sunbee." },
    { id: "s2", startMs: 2800, durationMs: 2700, text: "Phụ đề này chồng 0,2 giây lên câu trước." },
    { id: "s3", startMs: 5500, durationMs: 2500, text: "Ảnh vuông được cắt đúng khung 16:9." },
  ],
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
};

const result = await writeCapcutDraft(timeline, { draftsRoot, folderName: undefined });
console.log(JSON.stringify(result, null, 2));
