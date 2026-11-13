import type { FeatureModule } from "../types.js";
import router from "./routes.js";

/**
 * Voice library: voices cloned from a sample or picked from the built-in
 * catalog, run through a local TTS sidecar (`server/services/voice/`). Not
 * a pipeline step yet — just the library that will feed a future "Lồng
 * tiếng" step. No AI tasks: synthesis isn't an LLM prompt, so nothing to
 * list in Settings → Prompts.
 */
export const voiceoverModule: FeatureModule = {
  key: "voiceover",
  mountPath: "voiceover",
  router,
  tasks: [],
};
