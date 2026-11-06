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

export async function extractFramesFromVideoFile(
  videoPath: string,
  maxFrames = 8,
): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-frames-"));
  try {
    const { code } = await runFfmpeg([
      "-i",
      videoPath,
      "-vf",
      "fps=1/5,scale=512:-1",
      "-q:v",
      "3",
      "-frames:v",
      String(maxFrames),
      join(dir, "frame_%02d.jpg"),
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
