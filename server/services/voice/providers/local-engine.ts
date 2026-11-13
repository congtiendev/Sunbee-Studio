import { getVoiceEngineBaseUrl } from "../engine-process.js";
import type { VoiceProvider, VoiceSynthesisRequest } from "./types.js";

/** Vocal separation can take minutes on CPU-only hardware. */
const SEPARATE_TIMEOUT_MS = 20 * 60_000;

/** FastAPI's HTTPException body is `{"detail": "..."}` — pull that out instead of showing the raw JSON. */
async function describeError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { detail?: string };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text;
}

/** Calls the local Python sidecar started by `engine-process.ts`. */
export function createLocalVoiceEngine(): VoiceProvider {
  return {
    async synthesize(req: VoiceSynthesisRequest): Promise<Buffer> {
      const baseUrl = await getVoiceEngineBaseUrl();
      const res = await fetch(`${baseUrl}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          sample_path: req.sampleAudioPath,
          preset_voice_id: req.presetVoiceId,
          language: req.language ?? "vi",
        }),
      });
      if (!res.ok) {
        throw new Error(`Engine giọng nói lỗi (${res.status}). ${await describeError(res)}`.trim());
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/** Isolates the vocal track from a song, for use as a cloning sample. */
export async function separateVocals(songPath: string): Promise<Buffer> {
  const baseUrl = await getVoiceEngineBaseUrl();
  const res = await fetch(`${baseUrl}/separate-vocals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_path: songPath }),
    signal: AbortSignal.timeout(SEPARATE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Tách giọng lỗi (${res.status}). ${await describeError(res)}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}
