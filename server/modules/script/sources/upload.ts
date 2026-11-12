import OpenAI, { toFile } from "openai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalyzeProvider } from "../../../../shared/script-cost-estimate.js";
import type { AiEffort } from "../../../services/ai/providers/index.js";
import {
  firstAvailableProvider,
  MissingApiKeyError,
  runTask,
  type TaskContext,
} from "../../../services/ai/task.js";
import { extractAudioForTranscription } from "../media/extract-audio.js";
import { extractFramesFromVideoFile } from "../media/extract-frames.js";
import { formatIntoParagraphs } from "../media/format-paragraphs.js";
import {
  describeFramesTask,
  type ScriptLanguage,
} from "../tasks/describe-frames.js";
import { verifyTranscriptTask } from "../tasks/verify-transcript.js";

// Stable, broadly-supported, cheapest transcription model. OpenAI also offers
// gpt-4o-transcribe / gpt-4o-mini-transcribe as higher-quality upgrades later.
const WHISPER_MODEL = "whisper-1";

// Just a safety net against an accidental multi-GB upload buffered fully in
// memory (multer's memoryStorage) — NOT Whisper's limit. The uploaded video
// itself can be any length; its audio is extracted and compressed to a tiny
// MP3 (see extract-audio.ts) before it ever reaches the transcription API,
// so a 20+ minute video is fine well under this cap.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export interface VideoTranscription {
  scriptText: string;
  frames: string[];
  noSpeechDetected: boolean;
  aiDescribed: boolean;
}

export interface UploadSourceOptions {
  describeProvider?: AnalyzeProvider;
  describeModel?: string;
  describeEffort?: AiEffort;
  language?: ScriptLanguage;
}

// Per OpenAI's docs: a segment is effectively silent/non-speech when its
// no_speech_prob is high AND its avg_logprob is low (the model isn't
// confident in the words it transcribed either) — checking no_speech_prob
// alone would also flag quiet-but-real speech.
const NO_SPEECH_PROB_THRESHOLD = 0.6;
const AVG_LOGPROB_THRESHOLD = -1;

/**
 * Script source "upload": transcribes an uploaded video with Whisper (OpenAI
 * key required), samples frames, and — when there's no real speech, or no
 * audio track at all — describes the frames as a stand-in script. The audio
 * is extracted and compressed to a small MP3 first (same as the "link"
 * source), so the video's own length/size doesn't matter — only the
 * resulting audio needs to fit Whisper's cap, and that holds for ~100
 * minutes of speech (see extract-audio.ts).
 */
export async function transcribeVideoFile(
  buffer: Buffer,
  filename: string,
  ctx: TaskContext,
  options: UploadSourceOptions = {},
): Promise<VideoTranscription> {
  if (!ctx.keys.openai) throw new MissingApiKeyError("openai");
  const dir = await mkdtemp(join(tmpdir(), "sunbee-upload-"));
  try {
    const videoPath = join(dir, filename || "video.mp4");
    await writeFile(videoPath, buffer);
    const frames = await extractFramesFromVideoFile(videoPath);
    const audio = await extractAudioForTranscription(videoPath);
    if (audio) {
      return transcribeMedia(
        ctx,
        { media: audio, filename: "audio.mp3", frames },
        options,
      );
    }

    // No usable audio track (silent video, or ffmpeg couldn't read one) —
    // describe what the frames show, same as a silent "link" video.
    if (frames.length > 0) {
      const description = await describeFramesBestEffort(
        ctx,
        frames,
        options,
      );
      if (description) {
        return {
          scriptText: description,
          frames,
          noSpeechDetected: true,
          aiDescribed: true,
        };
      }
    }
    throw new Error(
      "Không đọc được âm thanh từ video này, và cũng không thể mô tả khung hình thay thế.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The speech-to-script pipeline shared by the "upload" and "link" sources:
 * Whisper on the media (a video, or an extracted audio track), a
 * hallucination check against the frames, and — for videos without real
 * speech — an AI description of the frames as a stand-in script.
 */
export async function transcribeMedia(
  ctx: TaskContext,
  {
    media,
    filename,
    frames,
  }: { media: Buffer; filename: string; frames: string[] },
  {
    describeProvider = "claude",
    describeModel,
    describeEffort,
    language = "vi",
  }: UploadSourceOptions = {},
): Promise<VideoTranscription> {
  if (!ctx.keys.openai) throw new MissingApiKeyError("openai");
  const client = new OpenAI({ apiKey: ctx.keys.openai });

  const response = await client.audio.transcriptions.create({
    file: await toFile(media, filename),
    model: WHISPER_MODEL,
    response_format: "verbose_json",
  });

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
      // The AI picked for the video (Claude by default) checks the transcript.
      const verifier =
        firstAvailableProvider(ctx, describeProvider) ?? "claude";
      const verification = await runTask(
        verifyTranscriptTask,
        {
          scriptText: response.text,
          frames,
          provider: verifier,
          model: verifier === describeProvider ? describeModel : undefined,
          effort: verifier === describeProvider ? describeEffort : undefined,
        },
        ctx,
      );
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
  // the OpenAI key is always present at this point, since this source
  // hard-requires it for Whisper — so this never depends on having both
  // keys set up.
  let scriptText = noSpeechDetected ? "" : formatIntoParagraphs(response.text);
  let aiDescribed = false;
  if (noSpeechDetected && frames.length > 0) {
    const description = await describeFramesBestEffort(ctx, frames, {
      describeProvider,
      describeModel,
      describeEffort,
      language,
    });
    if (description) {
      scriptText = description;
      aiDescribed = true;
    }
  }

  return { scriptText, frames, noSpeechDetected, aiDescribed };
}

/**
 * Frames → stand-in script. Tries the user's provider first, then the other
 * one the user has a key for (GPT-4.1 default when falling back to OpenAI).
 * Returns "" when no provider could do it.
 */
export async function describeFramesBestEffort(
  ctx: TaskContext,
  frames: string[],
  {
    describeProvider = "claude",
    describeModel,
    describeEffort,
    language = "vi",
  }: UploadSourceOptions = {},
): Promise<string> {
  const order: AnalyzeProvider[] =
    describeProvider === "claude" ? ["claude", "openai"] : ["openai", "claude"];
  for (const provider of order) {
    if (!(provider === "claude" ? ctx.keys.anthropic : ctx.keys.openai))
      continue;
    try {
      const description = await runTask(
        describeFramesTask,
        {
          frames,
          provider,
          // The picked model/effort only apply to the picked provider.
          model: provider === describeProvider ? describeModel : undefined,
          effort: provider === describeProvider ? describeEffort : undefined,
          language,
        },
        ctx,
      );
      if (description) return description;
    } catch {
      // Try the next provider.
    }
  }
  return "";
}
