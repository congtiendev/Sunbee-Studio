import OpenAI, { toFile } from "openai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFramesFromVideoFile } from "./extract-frames.js";
import { formatIntoParagraphs } from "./format-paragraphs.js";

// Stable, broadly-supported, cheapest transcription model. OpenAI also offers
// gpt-4o-transcribe / gpt-4o-mini-transcribe as higher-quality upgrades later.
const WHISPER_MODEL = "whisper-1";

export interface VideoTranscription {
  scriptText: string;
  frames: string[];
}

export async function transcribeVideoFile(
  buffer: Buffer,
  filename: string,
  apiKey: string,
): Promise<VideoTranscription> {
  const client = new OpenAI({ apiKey });

  const response = await client.audio.transcriptions.create({
    file: await toFile(buffer, filename),
    model: WHISPER_MODEL,
  });

  const frames = await extractFramesFromUploadedBuffer(buffer, filename);

  return { scriptText: formatIntoParagraphs(response.text), frames };
}

// Best-effort: writes the already-uploaded buffer to a temp file so ffmpeg
// can read it, then cleans up. Never throws — see extract-frames.ts.
async function extractFramesFromUploadedBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-upload-"));
  try {
    const videoPath = join(dir, filename || "video.mp4");
    await writeFile(videoPath, buffer);
    return await extractFramesFromVideoFile(videoPath);
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
