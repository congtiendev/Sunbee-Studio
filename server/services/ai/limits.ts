/**
 * Output budgets (max tokens) for AI tasks, in one place.
 *
 * A script runs up to ~30,000 characters. Vietnamese takes roughly 2–2.5
 * characters per token, so a whole script is ~12–15k tokens of text — and the
 * model's thinking (effort) counts against the same limit. Providers stream the
 * request when a budget is above what a plain request allows, and fail loudly
 * rather than return a truncated result (`providers/anthropic.ts`, `openai.ts`).
 *
 * The analyze/director prompt (shots, per-shot image/sprite-sheet layers,
 * placement text) produces far more JSON per scene than a flat one-image
 * breakdown, so every structured-output budget here is set to 128,000 —
 * Claude Opus 5.5 and Sonnet 5.5's actual max output — instead of a smaller
 * number tuned for the old, lighter output shape. A high `maxTokens` costs
 * nothing extra by itself: providers bill only the tokens actually generated,
 * this just raises the ceiling before a real response gets cut off and
 * discarded (`assertComplete` in `providers/anthropic.ts`). Only applies to
 * Claude — the OpenAI provider doesn't send a max-output cap at all.
 */
const MAX_MODEL_OUTPUT_TOKENS = 128_000;

/** A task that writes or rewrites a whole script (from an idea, documents, captions…). */
export const SCRIPT_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;

/** A whole script plus its scenes JSON, which repeats the script scene by scene. */
export const SCRIPT_WITH_SCENES_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;

/** Scenes JSON for one analysis passage (see `SCRIPT_CHARS_PER_ANALYZE_REQUEST`) — shots, layers and placement make this the heaviest per-scene output of all. */
export const ANALYSIS_PASSAGE_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;

/** A skill guide written from many sources. */
export const SKILL_GUIDE_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;

/** Notes on one part of a training source. */
export const SOURCE_NOTES_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;

/** A list of character names, each with a full, specific appearance description (age, face, hair, body, outfit, style). */
export const CHARACTER_ROSTER_OUTPUT_TOKENS = MAX_MODEL_OUTPUT_TOKENS;
