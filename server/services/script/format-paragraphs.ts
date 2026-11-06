const TARGET_PARAGRAPH_CHARS = 400;

// Machine-generated transcripts (captions, Whisper) come back as one long
// run-on block with no paragraph structure. Group sentences into paragraphs
// by approximate length so the result is actually readable/editable.
export function formatIntoParagraphs(text: string): string {
  const sentences = text
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return text.trim();

  const paragraphs: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    current.push(sentence);
    currentLength += sentence.length;
    if (currentLength >= TARGET_PARAGRAPH_CHARS) {
      paragraphs.push(current.join(" "));
      current = [];
      currentLength = 0;
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" "));

  return paragraphs.join("\n\n");
}
