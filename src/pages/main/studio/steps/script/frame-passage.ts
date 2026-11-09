export interface TextRange {
  start: number;
  end: number;
}

/** A passage longer than this (unpunctuated captions) is narrowed to a window around the target. */
const MAX_PASSAGE_CHARS = 320;
const WINDOW_RADIUS = 140;

/** Sentence/line spans of `text`, trimmed of surrounding whitespace. */
function sentenceRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const boundary = /[.!?…。]+["'”’)\]]*\s+|\n+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    ranges.push({ start, end });
    start = end;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges
    .map(({ start: s, end: e }) => {
      while (s < e && /\s/.test(text[s]!)) s++;
      while (e > s && /\s/.test(text[e - 1]!)) e--;
      return { start: s, end: e };
    })
    .filter((r) => r.end > r.start);
}

/** Widen `pos ± radius` out to word boundaries. */
function wordWindow(text: string, pos: number, range: TextRange): TextRange {
  let start = Math.max(range.start, pos - WINDOW_RADIUS);
  let end = Math.min(range.end, pos + WINDOW_RADIUS);
  while (start > range.start && !/\s/.test(text[start - 1]!)) start--;
  while (end < range.end && !/\s/.test(text[end]!)) end++;
  return { start, end };
}

/**
 * The passage of the script that frame `index` (of `count`) most likely
 * shows. Frames are sampled evenly over the whole video and the script
 * follows the video's order, so the frame's position in time maps to the
 * same relative position in the text — an estimate, snapped to the sentence
 * there (or a word window when the text has no punctuation).
 */
export function passageForFrame(
  text: string,
  index: number,
  count: number,
): TextRange | null {
  if (!text.trim() || count <= 0) return null;
  const pos = Math.min(
    text.length - 1,
    Math.floor(((index + 0.5) / count) * text.length),
  );
  const sentences = sentenceRanges(text);
  if (sentences.length === 0) return null;
  const sentence =
    sentences.find((r) => pos < r.end) ?? sentences[sentences.length - 1]!;
  return sentence.end - sentence.start > MAX_PASSAGE_CHARS
    ? wordWindow(text, Math.max(pos, sentence.start), sentence)
    : sentence;
}
