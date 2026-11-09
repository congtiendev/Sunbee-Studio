export type AnalyzeProvider = "openai" | "claude";

export interface AnalyzeModel {
  id: string;
  label: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
}

// Approximate list pricing per provider's pricing page; re-check there if this
// drifts (GPT-5.6 Luna/Terra promotional pricing in particular may change).
export const ANALYZE_MODELS: Record<AnalyzeProvider, AnalyzeModel[]> = {
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1", inputPricePer1M: 2.0, outputPricePer1M: 8.0 },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", inputPricePer1M: 4.0, outputPricePer1M: 20.0 },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", inputPricePer1M: 2.0, outputPricePer1M: 12.0 },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", inputPricePer1M: 0.2, outputPricePer1M: 1.2 },
  ],
  claude: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inputPricePer1M: 2.0, outputPricePer1M: 10.0 },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", inputPricePer1M: 4.0, outputPricePer1M: 20.0 },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", inputPricePer1M: 0.1, outputPricePer1M: 0.5 },
  ],
};

export const GPT_4_1_MODEL = ANALYZE_MODELS.openai[0]!.id;
export const CLAUDE_SONNET_MODEL = ANALYZE_MODELS.claude[0]!.id;

export function defaultModelFor(provider: AnalyzeProvider): string {
  return ANALYZE_MODELS[provider][0]!.id;
}

function findModel(provider: AnalyzeProvider, modelId?: string): AnalyzeModel {
  const models = ANALYZE_MODELS[provider];
  return models.find((m) => m.id === modelId) ?? models[0]!;
}

// Rough chars-per-token heuristic; the structured scenes/resources/style JSON
// typically runs a bit larger than the input script, hence the multiplier —
// bumped up since scenes now ask for much more detailed visualDescription prose.
const CHARS_PER_TOKEN = 4;
const OUTPUT_TOKEN_MULTIPLIER = 2.2;

// Rough flat per-image token cost (every model's vision tokenization isn't
// purely linear — this is a ballpark for the UI estimate, not a bill).
// OpenAI frames are sent at "high" detail (tiled, ~255-425 tokens/image
// depending on size) rather than "low" (flat 85 tokens); Claude has no
// detail toggle and always processes at full resolution.
const TOKENS_PER_IMAGE = 350;

export interface ScriptCostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  confidence: "low" | "medium" | "high";
}

/** Claude caps a single request at 100 images — longer videos get sampled
 * densely and the frames split across this many requests instead. */
export const FRAMES_PER_ANALYZE_REQUEST = 100;

export function chunkCountForFrames(frameCount: number): number {
  return Math.max(1, Math.ceil(frameCount / FRAMES_PER_ANALYZE_REQUEST));
}

/**
 * Longest script passage analyzed in one request. The scenes JSON repeats the
 * passage (each scene's `content`) plus visual notes, so a long script — scripts
 * run up to ~30k characters — must be split for every response to fit.
 */
export const SCRIPT_CHARS_PER_ANALYZE_REQUEST = 8_000;

/** How many requests one analysis takes: enough for both the frames and the text. */
export function analyzeChunkCount(scriptChars: number, frameCount: number): number {
  return Math.max(
    chunkCountForFrames(frameCount),
    Math.ceil(scriptChars / SCRIPT_CHARS_PER_ANALYZE_REQUEST),
    1,
  );
}

export function estimateAnalyzeScriptCost(
  scriptText: string,
  frameCount = 0,
  provider: AnalyzeProvider = "openai",
  modelId?: string,
): ScriptCostEstimate {
  const model = findModel(provider, modelId);
  // The script and frames are split across the requests (each gets its own
  // passage and the frames of that part of the video), so each is sent once.
  const scriptTokens = Math.ceil(scriptText.length / CHARS_PER_TOKEN);
  const estimatedInputTokens = scriptTokens + frameCount * TOKENS_PER_IMAGE;
  const estimatedOutputTokens = Math.ceil(
    (scriptTokens + frameCount * TOKENS_PER_IMAGE) * OUTPUT_TOKEN_MULTIPLIER,
  );
  const estimatedCostUsd =
    (estimatedInputTokens / 1_000_000) * model.inputPricePer1M +
    (estimatedOutputTokens / 1_000_000) * model.outputPricePer1M;

  const confidence: ScriptCostEstimate["confidence"] =
    scriptText.length < 500 ? "low" : scriptText.length < 5000 ? "medium" : "high";

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd, confidence };
}
