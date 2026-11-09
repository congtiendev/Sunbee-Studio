import { getSettings } from "../../settings-store.js";
import { logger } from "../logger.js";
import { resolvePrompt } from "./prompts.js";
import { createProvider, type LlmProvider, type ProviderKey } from "./providers/index.js";
import type { LocalizedText } from "../../../shared/types.js";

/**
 * An editable prompt fragment of a task. Overrides are stored per
 * `taskKey` + `slot.key`, so a task can expose several independent parts
 * (e.g. the base instructions and an extra hint used only with frames).
 */
export interface PromptSlot {
  key: string;
  label: LocalizedText;
  description?: LocalizedText;
  default: string;
}

export interface AiTaskDefinition {
  /** Stable id, e.g. `script.analyze`. Never rename: prompt overrides key on it. */
  key: string;
  /** The Video Studio step module that owns the task (`script`, `assets`, ...). */
  module: string;
  /**
   * Where in the step the task runs (e.g. the script source "upload"), so
   * Settings → Prompts can file it under the matching tab. Omitted: one tab per task.
   */
  group?: string;
  label: LocalizedText;
  description: LocalizedText;
  prompts: PromptSlot[];
}

export interface TaskContext {
  userId: string;
  keys: { openai?: string; anthropic?: string };
}

export interface AiTask<I, O> extends AiTaskDefinition {
  run(input: I, ctx: TaskContext): Promise<O>;
}

export function defineTask<I, O>(task: AiTask<I, O>): AiTask<I, O> {
  return task;
}

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderKey) {
    super(
      provider === "claude"
        ? "Chưa thiết lập Anthropic API key. Vào Settings để nhập key trước."
        : "Chưa thiết lập OpenAI API key. Vào Settings để nhập key trước.",
    );
    this.name = "MissingApiKeyError";
  }
}

export function taskContextFor(userId: string): TaskContext {
  const settings = getSettings(userId);
  return {
    userId,
    keys: { openai: settings.openaiApiKey, anthropic: settings.anthropicApiKey },
  };
}

export function hasProviderKey(ctx: TaskContext, provider: ProviderKey): boolean {
  return Boolean(provider === "claude" ? ctx.keys.anthropic : ctx.keys.openai);
}

/** The requested provider when its key is set, else whichever has a key (OpenAI first), else null. */
export function firstAvailableProvider(
  ctx: TaskContext,
  preferred?: ProviderKey,
): ProviderKey | null {
  if (preferred && hasProviderKey(ctx, preferred)) return preferred;
  if (hasProviderKey(ctx, "openai")) return "openai";
  if (hasProviderKey(ctx, "claude")) return "claude";
  return null;
}

export function providerFor(ctx: TaskContext, provider: ProviderKey): LlmProvider {
  const apiKey = provider === "claude" ? ctx.keys.anthropic : ctx.keys.openai;
  if (!apiKey) throw new MissingApiKeyError(provider);
  return createProvider(provider, apiKey);
}

/** The effective text of one prompt slot: user override, then global override, then default. */
export function promptOf(
  ctx: TaskContext,
  task: AiTaskDefinition,
  slotKey: string,
): string {
  const slot = task.prompts.find((p) => p.key === slotKey);
  if (!slot) throw new Error(`Unknown prompt slot ${task.key}.${slotKey}`);
  return resolvePrompt(ctx.userId, task.key, slot.key, slot.default);
}

export async function runTask<I, O>(
  task: AiTask<I, O>,
  input: I,
  ctx: TaskContext,
): Promise<O> {
  const startedAt = Date.now();
  try {
    return await task.run(input, ctx);
  } catch (err) {
    logger.warn("ai task failed", {
      task: task.key,
      userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    logger.info("ai task", {
      task: task.key,
      userId: ctx.userId,
      durationMs: Date.now() - startedAt,
    });
  }
}
