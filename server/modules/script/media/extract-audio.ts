import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** OpenAI's transcription API rejects files above 25 MB. */
const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

function runFfmpeg(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args);
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

/**
 * The audio track as a small mono MP3, sized for Whisper: 16 kHz / 32 kbps
 * keeps ~100 minutes under the 25 MB API cap. Best-effort: null when the
 * video has no audio, ffmpeg is missing, or the result is still too large.
 */
export async function extractAudioForTranscription(
  videoPath: string,
): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-audio-"));
  try {
    const out = join(dir, "audio.mp3");
    const code = await runFfmpeg([
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      "-y",
      out,
    ]);
    if (code !== 0) return null;
    const { size } = await stat(out);
    if (size === 0 || size > MAX_TRANSCRIPTION_BYTES) return null;
    return await readFile(out);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
