import { findPromptOverride } from "../db/prompt-overrides-repo.js";

/**
 * Resolution order for an editable prompt:
 * 1. the user's own override,
 * 2. the global override an admin set for everyone,
 * 3. the default text shipped in the task definition.
 */
export function resolvePrompt(
  userId: string,
  taskKey: string,
  slot: string,
  defaultText: string,
): string {
  return (
    findPromptOverride("user", userId, taskKey, slot)?.content ??
    findPromptOverride("global", "", taskKey, slot)?.content ??
    defaultText
  );
}
