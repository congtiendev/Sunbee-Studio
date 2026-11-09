import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalyzeProvider } from "../../../../shared/script-cost-estimate.js";
import type { LinkScriptOrigin } from "../../../../shared/types.js";
import {
  firstAvailableProvider,
  runTask,
  type TaskContext,
} from "../../../services/ai/task.js";
import { extractAudioForTranscription } from "../media/extract-audio.js";
import { extractFramesFromVideoFile } from "../media/extract-frames.js";
import {
  downloadVideo,
  fetchCaptions,
  noCaptionsError,
} from "../media/fetch-transcript.js";
import { cleanCaptionsTask } from "../tasks/clean-captions.js";
import type { ScriptLanguage } from "../tasks/describe-frames.js";
import { describeFramesBestEffort, transcribeMedia } from "./upload.js";

export interface LinkSourceOptions {
  /** Default true: clean captions with AI, transcribe when there are none. */
  useAi?: boolean;
  provider?: AnalyzeProvider;
  model?: string;
  language?: ScriptLanguage;
}

export interface LinkSourceResult {
  scriptText: string;
  frames: string[];
  origin: LinkScriptOrigin;
  noSpeechDetected?: boolean;
}

/**
 * A cleanup much shorter than its input was most likely cut off or
 * summarized — the task must not drop content, so keep the raw captions.
 */
const MIN_CLEANED_RATIO = 0.6;

/**
 * The picked AI (or whichever has a key) looks at frames from the whole
 * video and edits the speech text. Claude can't hear audio, so speech always
 * comes in as text (Whisper transcription or captions). Best-effort: null
 * when no AI is available, it fails, or the result looks cut off/summarized.
 */
async function editSpeech(
  ctx: TaskContext,
  text: string,
  kind: "captions" | "transcript",
  frames: string[],
  provider: AnalyzeProvider | undefined,
  model: string | undefined,
): Promise<string | null> {
  const editor = firstAvailableProvider(ctx, provider);
  if (!editor) return null;
  try {
    const edited = await runTask(
      cleanCaptionsTask,
      {
        captions: text,
        kind,
        frames,
        provider: editor,
        model: editor === provider ? model : undefined,
      },
      ctx,
    );
    return edited.length >= text.length * MIN_CLEANED_RATIO ? edited : null;
  } catch {
    return null;
  }
}

/**
 * Script source "link": handled like an uploaded video. The whole video is
 * downloaded, its full audio track transcribed with Whisper, the transcript
 * checked against frames spread over the entire video, and a silent video
 * described from those frames. The site's captions are only a fallback (no
 * OpenAI key, or the video couldn't be downloaded), cleaned up by whichever
 * AI is available. With AI off, the captions are returned as they are.
 */
export async function fetchScriptFromLink(
  url: string,
  ctx: TaskContext,
  { useAi = true, provider, model, language = "vi" }: LinkSourceOptions = {},
): Promise<LinkSourceResult> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-link-"));
  try {
    const [captions, videoPath] = await Promise.all([
      fetchCaptions(url),
      downloadVideo(url, dir),
    ]);
    const frames = videoPath ? await extractFramesFromVideoFile(videoPath) : [];
    const options = {
      describeProvider: provider,
      describeModel: model,
      language,
    };

    if (!useAi) {
      if (captions.text)
        return { scriptText: captions.text, frames, origin: "captions" };
      throw noCaptionsError(
        captions.error,
        'Bật "Dùng AI" để AI xem và nghe toàn bộ video, hoặc dán kịch bản trực tiếp.',
      );
    }

    // 1) Watch the whole video, exactly like an upload.
    let transcribeError: unknown = null;
    if (videoPath && ctx.keys.openai) {
      const audio = await extractAudioForTranscription(videoPath);
      if (audio) {
        try {
          const result = await transcribeMedia(
            ctx,
            { media: audio, filename: "audio.mp3", frames },
            options,
          );
          if (result.scriptText && result.aiDescribed) {
            return {
              scriptText: result.scriptText,
              frames,
              origin: "framesDescribed",
              noSpeechDetected: true,
            };
          }
          if (result.scriptText) {
            // The picked AI (Claude by default) watches the frames and edits the transcription.
            const reviewed = await editSpeech(
              ctx,
              result.scriptText,
              "transcript",
              frames,
              provider,
              model,
            );
            return reviewed
              ? { scriptText: reviewed, frames, origin: "transcribedReviewed" }
              : {
                  scriptText: result.scriptText,
                  frames,
                  origin: "transcribed",
                };
          }
        } catch (err) {
          transcribeError = err;
        }
      } else if (frames.length > 0) {
        // No audio track at all: a silent video, describe what it shows.
        const description = await describeFramesBestEffort(
          ctx,
          frames,
          options,
        );
        if (description) {
          return {
            scriptText: description,
            frames,
            origin: "framesDescribed",
            noSpeechDetected: true,
          };
        }
      }
    }

    // 2) Fallback (no OpenAI key to hear the audio): the site's captions,
    //    edited by the picked AI while it watches the frames of the whole video.
    if (captions.text) {
      const cleaned = await editSpeech(
        ctx,
        captions.text,
        "captions",
        frames,
        provider,
        model,
      );
      return cleaned
        ? { scriptText: cleaned, frames, origin: "captionsCleaned" }
        : { scriptText: captions.text, frames, origin: "captions" };
    }

    // 3) No captions and no transcription: describe what the frames show.
    if (frames.length > 0 && firstAvailableProvider(ctx) !== null) {
      const description = await describeFramesBestEffort(ctx, frames, options);
      if (description) {
        return {
          scriptText: description,
          frames,
          origin: "framesDescribed",
          noSpeechDetected: true,
        };
      }
    }
    if (transcribeError) throw transcribeError;
    throw noCaptionsError(
      captions.error,
      videoPath
        ? "Cần OpenAI API key để AI nghe audio của video (Whisper). Vào Settings để nhập key, hoặc dán kịch bản trực tiếp."
        : "Cũng không tải được video để AI xem. Hãy dán kịch bản trực tiếp.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
