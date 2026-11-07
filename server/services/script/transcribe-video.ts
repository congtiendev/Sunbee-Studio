import OpenAI, { toFile } from "openai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalyzeProvider } from "../../../shared/script-cost-estimate.js";
import {
  describeVideoFromFrames,
  type ScriptLanguage,
} from "./describe-video-from-frames.js";
import { describeVideoFromFramesOpenAi } from "./describe-video-from-frames-openai.js";
import { extractFramesFromVideoFile } from "./extract-frames.js";
import { formatIntoParagraphs } from "./format-paragraphs.js";
import { verifyTranscriptIsRealSpeech } from "./verify-transcript.js";

// Stable, broadly-supported, cheapest transcription model. OpenAI also offers
// gpt-4o-transcribe / gpt-4o-mini-transcribe as higher-quality upgrades later.
const WHISPER_MODEL = "whisper-1";

export interface VideoTranscription {
  scriptText: string;
  frames: string[];
  noSpeechDetected: boolean;
  aiDescribed: boolean;
}

// Per OpenAI's docs: a segment is effectively silent/non-speech when its
// no_speech_prob is high AND its avg_logprob is low (the model isn't
// confident in the words it transcribed either) — checking no_speech_prob
// alone would also flag quiet-but-real speech.
const NO_SPEECH_PROB_THRESHOLD = 0.6;
const AVG_LOGPROB_THRESHOLD = -1;

export async function transcribeVideoFile(
  buffer: Buffer,
  filename: string,
  apiKey: string,
  anthropicApiKey?: string,
  describeProvider: AnalyzeProvider = "claude",
  describeModel?: string,
  scriptLanguage: ScriptLanguage = "vi",
): Promise<VideoTranscription> {
  const client = new OpenAI({ apiKey });

  const response = await client.audio.transcriptions.create({
    file: await toFile(buffer, filename),
    model: WHISPER_MODEL,
    response_format: "verbose_json",
  });

  const frames = await extractFramesFromUploadedBuffer(buffer, filename);

  const segments = response.segments ?? [];
  let noSpeechDetected =
    segments.length === 0 ||
    segments.every(
      (s) =>
        s.no_speech_prob > NO_SPEECH_PROB_THRESHOLD &&
        s.avg_logprob < AVG_LOGPROB_THRESHOLD,
    );

  // Whisper's own confidence scores can still miss a hallucination it
  // produced "confidently" (e.g. a short phrase in an unrelated language) —
  // cross-check with an LLM read of the transcript text itself as a second
  // opinion before trusting it. Best-effort: if this call fails, fall back
  // to the confidence-score verdict rather than failing the whole upload.
  if (!noSpeechDetected && response.text.trim()) {
    try {
      const verification = await verifyTranscriptIsRealSpeech(response.text, frames, apiKey);
      if (!verification.isLikelyRealSpeech) noSpeechDetected = true;
    } catch {
      // Keep the confidence-score verdict.
    }
  }

  // Whisper hallucinates plausible-looking but meaningless text when fed
  // audio with no real speech (music/sfx only) — surfacing that text as the
  // "script" would silently corrupt the very first step of the pipeline, so
  // we drop it. If a video has no real dialogue, there's nothing to
  // transcribe — instead have an LLM with vision describe what's actually
  // happening in the sampled frames as a stand-in script, so every video
  // (spoken or silent) ends up with a usable script. Use whichever
  // provider/model the user picked for this step; if that's Claude but no
  // Anthropic key is configured (or the call fails), fall back to GPT-4.1 —
  // the OpenAI key is always present at this point, since this route
  // hard-requires it for Whisper — so this never depends on having both
  // keys set up.
  let scriptText = noSpeechDetected ? "" : formatIntoParagraphs(response.text);
  let aiDescribed = false;
  if (noSpeechDetected && frames.length > 0) {
    let description = "";
    if (describeProvider === "claude" && anthropicApiKey) {
      try {
        description = await describeVideoFromFrames(
          frames,
          anthropicApiKey,
          describeModel,
          scriptLanguage,
        );
      } catch {
        // Fall through to the OpenAI fallback below.
      }
    }
    if (!description) {
      try {
        description = await describeVideoFromFramesOpenAi(
          frames,
          apiKey,
          describeProvider === "openai" ? describeModel : undefined,
          scriptLanguage,
        );
      } catch {
        // Keep the blank script + "no speech detected" hint.
      }
    }
    if (description) {
      scriptText = description;
      aiDescribed = true;
    }
  }

  return { scriptText, frames, noSpeechDetected, aiDescribed };
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
