import { FRAMES_PER_ANALYZE_REQUEST } from "../../../shared/script-cost-estimate.js";
import type { ScriptAnalyzeResult, ScriptScene } from "../../../shared/types.js";

/** Frames split into contiguous groups of at most `FRAMES_PER_ANALYZE_REQUEST`. */
export function chunkFrames(frames: string[]): string[][] {
  if (frames.length <= FRAMES_PER_ANALYZE_REQUEST) return [frames];
  const chunks: string[][] = [];
  for (let i = 0; i < frames.length; i += FRAMES_PER_ANALYZE_REQUEST) {
    chunks.push(frames.slice(i, i + FRAMES_PER_ANALYZE_REQUEST));
  }
  return chunks;
}

const SENTENCE_BOUNDARY = /[.!?…。]+["'”’)\]]*\s+|\n+/g;

/** Sentence/line end offsets of `text`, always including the final one. */
function sentenceBreaks(text: string): number[] {
  const breaks: number[] = [];
  for (const match of text.matchAll(SENTENCE_BOUNDARY)) {
    breaks.push(match.index + match[0].length);
  }
  if (breaks[breaks.length - 1] !== text.length) breaks.push(text.length);
  return breaks;
}

/**
 * The full script text, cut into `chunkCount` contiguous, same-order
 * passages of roughly equal length — snapped to the nearest sentence/line
 * break so no chunk starts or ends mid-sentence. Each passage is handed to
 * the AI together with the frames sampled from that same part of the video,
 * so a chunked analysis still sees matching script + visuals per request
 * instead of the whole script repeated against every frame group.
 */
export function chunkScriptText(text: string, chunkCount: number): string[] {
  if (chunkCount <= 1 || !text.trim()) return [text];
  const breaks = sentenceBreaks(text);
  if (breaks.length <= chunkCount) return [text];

  const cuts: number[] = [0];
  for (let i = 1; i < chunkCount; i++) {
    const target = Math.round((i / chunkCount) * text.length);
    const nearest = breaks.reduce((best, b) =>
      Math.abs(b - target) < Math.abs(best - target) ? b : best,
    );
    cuts.push(Math.max(cuts[cuts.length - 1]!, nearest));
  }
  cuts.push(text.length);

  const passages: string[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    passages.push(text.slice(cuts[i], cuts[i + 1]).trim());
  }
  return passages;
}

/** Dedupe while keeping first-seen order, dropping empty/blank entries. */
function dedupeNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** The most frequent value, first-seen wins a tie. */
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value.trim()) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const value of values) {
    const count = counts.get(value) ?? 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Combine one `ScriptAnalyzeResult` per chunk (in script order) into a
 * single result, as if it had come from one request. Scenes are
 * concatenated and reindexed; resources/style fields are summed, unioned
 * or the most representative value across chunks as fits each field.
 */
export function mergeAnalyzeResults(
  results: ScriptAnalyzeResult[],
): ScriptAnalyzeResult {
  if (results.length === 1) return results[0]!;

  const scenes: ScriptScene[] = results.flatMap((r) => r.scenes);
  scenes.forEach((scene, i) => {
    scene.index = i + 1;
  });

  const resources = results.reduce<ScriptAnalyzeResult["resources"]>(
    (acc, r) => ({
      shotCount: acc.shotCount + (r.resources.shotCount || 0),
      voiceover: dedupeNonEmpty([acc.voiceover, r.resources.voiceover]).join(
        "; ",
      ),
      music: dedupeNonEmpty([acc.music, r.resources.music]).join("; "),
      images: dedupeNonEmpty([...acc.images, ...r.resources.images]),
      notes: dedupeNonEmpty([acc.notes, r.resources.notes]).join("; "),
    }),
    { shotCount: 0, voiceover: "", music: "", images: [], notes: "" },
  );

  const style: ScriptAnalyzeResult["style"] = {
    genre: mode(results.map((r) => r.style.genre)),
    styleTags: dedupeNonEmpty(results.flatMap((r) => r.style.styleTags)),
    toneDescription: results
      .map((r) => r.style.toneDescription)
      .reduce((longest, d) => (d.length > longest.length ? d : longest), ""),
  };

  return { scenes, resources, style };
}
