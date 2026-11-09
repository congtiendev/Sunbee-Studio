import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// Not a product choice — Anthropic's Messages API hard-caps a single request
// at 100 images. Short videos get 1 frame every 2s (a 10s clip → ~5 frames,
// a 2min clip → ~60); longer ones widen the interval so the 100 frames still
// cover the WHOLE video instead of stopping after the first 200 seconds.
const MAX_FRAMES_SAFETY_CAP = 100;
const MIN_FRAME_INTERVAL_SEC = 2;

export async function extractFramesFromVideoFile(
  videoPath: string,
): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-frames-"));
  try {
    const duration = await probeDurationSec(videoPath);
    const interval = duration
      ? Math.max(MIN_FRAME_INTERVAL_SEC, duration / MAX_FRAMES_SAFETY_CAP)
      : MIN_FRAME_INTERVAL_SEC;
    // 1 frame every `interval` seconds (2s for short videos) — short-form videos (Reels/TikTok-style, cuts every
    // few seconds) need denser sampling to catch every scene change and keep
    // on-screen text (chat timestamps, captions) legible; scale bumped to
    // 640px wide for the same reason.
    const { code } = await runFfmpeg([
      "-i",
      videoPath,
      "-vf",
      `fps=1/${interval.toFixed(3)},scale=640:-1`,
      "-q:v",
      "2",
      "-frames:v",
      String(MAX_FRAMES_SAFETY_CAP),
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
