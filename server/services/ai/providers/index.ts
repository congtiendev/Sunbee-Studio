import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAiProvider } from "./openai.js";
import type { LlmProvider, ProviderKey } from "./types.js";

export type * from "./types.js";

const FACTORIES: Record<ProviderKey, (apiKey: string) => LlmProvider> = {
  openai: createOpenAiProvider,
  claude: createAnthropicProvider,
};

export function createProvider(key: ProviderKey, apiKey: string): LlmProvider {
  return FACTORIES[key](apiKey);
}
