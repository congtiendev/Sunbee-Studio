/**
 * Output budgets (max tokens) for AI tasks, in one place.
 *
 * A script runs up to ~30,000 characters. Vietnamese takes roughly 2–2.5
 * characters per token, so a whole script is ~12–15k tokens of text — and the
 * model's thinking (effort) counts against the same limit. Providers stream the
 * request when a budget is above what a plain request allows, and fail loudly
 * rather than return a truncated result (`providers/anthropic.ts`, `openai.ts`).
 */

/** A task that writes or rewrites a whole script (from an idea, documents, captions…). */
export const SCRIPT_OUTPUT_TOKENS = 48_000;

/** A whole script plus its scenes JSON, which repeats the script scene by scene. */
export const SCRIPT_WITH_SCENES_OUTPUT_TOKENS = 64_000;

/** Scenes JSON for one analysis passage (see `SCRIPT_CHARS_PER_ANALYZE_REQUEST`). */
export const ANALYSIS_PASSAGE_OUTPUT_TOKENS = 32_000;

/** A skill guide written from many sources. */
export const SKILL_GUIDE_OUTPUT_TOKENS = 32_000;

/** Notes on one part of a training source. */
export const SOURCE_NOTES_OUTPUT_TOKENS = 8_000;

/**
 * A list of character names, each with a full, specific appearance description
 * (age, face, hair, body, outfit, style). Providers require a numeric cap —
 * there's no "unlimited" — so this is set to the same ceiling as the largest
 * budget in this file, high enough that a cast of any realistic size won't
 * hit it.
 */
export const CHARACTER_ROSTER_OUTPUT_TOKENS = SCRIPT_WITH_SCENES_OUTPUT_TOKENS;
