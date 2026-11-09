import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FRAMES_PER_ANALYZE_REQUEST } from "../../../../shared/script-cost-estimate.js";

/** Video length in seconds (via ffprobe), or null when it can't be read. */
export function probeDurationSec(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      videoPath,
    ]);
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("close", () => {
      const seconds = Number.parseFloat(out.trim());
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    });
    child.on("error", () => resolve(null));
  });
}

function runFfmpeg(args: string[]): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args);
    child.on("close", (code) => resolve({ code: code ?? 1 }));
    child.on("error", () => resolve({ code: 1 }));
  });
}

// Anthropic's Messages API hard-caps a SINGLE request at 100 images — that's
// `FRAMES_PER_ANALYZE_REQUEST` in shared/script-cost-estimate.ts, and
// analyzeScriptForUser() splits frames into chunks of that size and calls
// the AI once per chunk. So extraction is no longer limited to 100 frames
// total: it targets a roughly constant sampling density (1 frame every
// ~3s) up to a ceiling of MAX_CHUNKS requests worth of frames, and only
// widens the interval for videos long enough to exceed that ceiling.
const TARGET_FRAME_INTERVAL_SEC = 3;
const MIN_FRAME_INTERVAL_SEC = 2;
const MAX_CHUNKS = 6;
const MAX_FRAMES_SAFETY_CAP = MAX_CHUNKS * FRAMES_PER_ANALYZE_REQUEST;

export async function extractFramesFromVideoFile(
  videoPath: string,
): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-frames-"));
  try {
    const duration = await probeDurationSec(videoPath);
    const idealFrameCount = duration
      ? Math.ceil(duration / TARGET_FRAME_INTERVAL_SEC)
      : MAX_FRAMES_SAFETY_CAP;
    const frameCount = Math.min(idealFrameCount, MAX_FRAMES_SAFETY_CAP);
    const interval = duration
      ? Math.max(MIN_FRAME_INTERVAL_SEC, duration / frameCount)
      : MIN_FRAME_INTERVAL_SEC;
    // 1 frame every `interval` seconds (down to 2s for short/short-form
    // videos — Reels/TikTok-style, cuts every few seconds — which need
    // denser sampling to catch every scene change and keep on-screen text
    // legible); scale bumped to 640px wide for the same reason.
    const { code } = await runFfmpeg([
      "-i",
      videoPath,
      "-vf",
      `fps=1/${interval.toFixed(3)},scale=640:-1`,
      "-q:v",
      "2",
      "-frames:v",
      String(frameCount),
      join(dir, "frame_%03d.jpg"),
    ]);
    if (code !== 0) return [];

    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    const frames: string[] = [];
    for (const file of files) {
      const buffer = await readFile(join(dir, file));
      frames.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
    }
    return frames;
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
