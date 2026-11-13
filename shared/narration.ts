import type { ScriptScene } from "./types.js";

/**
 * Checks scenes' `narration` against the script it was taken from: the voice
 * reads the narration, so a scene that paraphrases (or a missing passage)
 * would put words on screen the script never had. Comparison ignores case,
 * punctuation, spacing and bracketed visual notes — only the spoken words count.
 */
export interface NarrationCheck {
  /** Share of the script's spoken words covered by the scenes' narration, 0..1. */
  coverage: number;
  /** Scenes still without narration (the field is absent). */
  missing: number[];
  /** Scenes whose narration isn't found in the script, in order. */
  mismatched: number[];
}

/** Spoken words only: no [visual notes], lower-case, letters/digits separated by single spaces. */
export function spokenWords(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\[[^\]]*\]/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function checkNarration(scriptText: string, scenes: ScriptScene[]): NarrationCheck {
  const script = spokenWords(scriptText);
  const missing: number[] = [];
  const mismatched: number[] = [];
  let cursor = 0;
  let covered = 0;
  for (const scene of scenes) {
    if (scene.narration === undefined) {
      missing.push(scene.index);
      continue;
    }
    const words = spokenWords(scene.narration);
    if (!words) continue;
    // Each scene's words must appear after the previous scene's.
    const at = script.indexOf(words, cursor);
    if (at === -1) {
      mismatched.push(scene.index);
      continue;
    }
    cursor = at + words.length;
    covered += words.length;
  }
  return {
    coverage: script.length ? Math.min(1, covered / script.length) : 1,
    missing,
    mismatched,
  };
}
