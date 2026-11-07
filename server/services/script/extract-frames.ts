import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runFfmpeg(args: string[]): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args);
    child.on("close", (code) => resolve({ code: code ?? 1 }));
    child.on("error", () => resolve({ code: 1 }));
  });
}

// Not a product choice — Anthropic's Messages API hard-caps a single request
// at 100 images, so this is only a technical safety net for unusually long
// uploads. The actual frame count otherwise scales naturally with the
// video's real length: the fps filter below just emits 1 frame every 2s for
// as long as the input lasts, so a 10s clip yields ~5 frames and a 2min clip
// yields ~60, with no artificial ceiling below that.
const MAX_FRAMES_SAFETY_CAP = 100;

export async function extractFramesFromVideoFile(videoPath: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-frames-"));
  try {
    // 1 frame every 2s — short-form videos (Reels/TikTok-style, cuts every
    // few seconds) need denser sampling to catch every scene change and keep
    // on-screen text (chat timestamps, captions) legible; scale bumped to
    // 640px wide for the same reason.
    const { code } = await runFfmpeg([
      "-i",
      videoPath,
      "-vf",
      "fps=1/2,scale=640:-1",
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
