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
// typically runs a bit larger than the input script, hence the multiplier.
const CHARS_PER_TOKEN = 4;
const OUTPUT_TOKEN_MULTIPLIER = 1.4;

// Rough flat per-image token cost (every model's vision tokenization isn't
// purely linear — this is a ballpark for the UI estimate, not a bill).
const TOKENS_PER_IMAGE = 200;

export interface ScriptCostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  confidence: "low" | "medium" | "high";
}

export function estimateAnalyzeScriptCost(
  scriptText: string,
  frameCount = 0,
  provider: AnalyzeProvider = "openai",
  modelId?: string,
): ScriptCostEstimate {
  const model = findModel(provider, modelId);
  const estimatedInputTokens =
    Math.ceil(scriptText.length / CHARS_PER_TOKEN) + frameCount * TOKENS_PER_IMAGE;
  const estimatedOutputTokens = Math.ceil(
    estimatedInputTokens * OUTPUT_TOKEN_MULTIPLIER,
  );
  const estimatedCostUsd =
    (estimatedInputTokens / 1_000_000) * model.inputPricePer1M +
    (estimatedOutputTokens / 1_000_000) * model.outputPricePer1M;

  const confidence: ScriptCostEstimate["confidence"] =
    scriptText.length < 500 ? "low" : scriptText.length < 5000 ? "medium" : "high";

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd, confidence };
}
