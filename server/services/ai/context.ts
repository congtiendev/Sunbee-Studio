import type { DocumentRecord, ScriptAnalysisRecord, StyleTemplate } from "../../../shared/types.js";

/**
 * Builds the extra context appended to a task's system prompt, from
 * everything the user attached to the run (skill, documents, approved
 * examples, a template video...). Every task goes through here, so a new
 * kind of context is added in exactly one place.
 *
 * Each block has a character budget so a large attachment can't crowd out
 * the instructions or blow the model's context window.
 */
export interface ContextInput {
  skill?: StyleTemplate;
  /** Approved analyses to imitate (few-shot). */
  examples?: ScriptAnalysisRecord[];
  /** Reference documents (skill + project knowledge). */
  documents?: DocumentRecord[];
}

const BUDGET = {
  instructions: 8_000,
  examplesTotal: 16_000,
  exampleScript: 1_500,
  documentsTotal: 24_000,
  document: 10_000,
};

export function truncateToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[… đã lược bớt ${text.length - maxChars} ký tự]`;
}

function skillStyleLine(skill: StyleTemplate): string | null {
  // Agent Skills (and hand-made skills) may carry instructions only, no measured style.
  const hasStyle =
    skill.genre.trim() || skill.toneDescription.trim() || skill.styleTags.length > 0;
  if (!hasStyle) return null;
  return `Giữ phong cách theo skill đã lưu "${skill.name}": thể loại ${skill.genre}, các từ khoá phong cách ${skill.styleTags.join(", ")}, tone/giọng điệu: ${skill.toneDescription}, nhịp độ trung bình ${skill.pacing.avgShotLengthSec.toFixed(1)}s/cảnh (~${skill.pacing.cutsPerMinute.toFixed(1)} cắt/phút).`;
}

function skillInstructionsBlock(skill: StyleTemplate): string | null {
  const instructions = skill.instructions?.trim();
  if (!instructions) return null;
  return `Hướng dẫn riêng của skill "${skill.name}" (luôn tuân theo):\n${truncateToBudget(instructions, BUDGET.instructions)}`;
}

/** The parts of an analysis that teach the model the expected output. */
function compactScenes(record: ScriptAnalysisRecord) {
  return record.scenes.map((scene) => ({
    index: scene.index,
    content: scene.content,
    visualDescription: scene.visualDescription,
    estimatedDurationSec: scene.estimatedDurationSec,
    narrativeRole: scene.narrativeRole,
    shotSize: scene.shotSize,
    cameraMovement: scene.cameraMovement,
    heroMoment: scene.heroMoment,
    // Ids are bookkeeping, not something to imitate.
    requiredAssets: scene.requiredAssets.map(({ id: _id, ...asset }) => asset),
  }));
}

function examplesBlock(examples: ScriptAnalysisRecord[]): string | null {
  if (examples.length === 0) return null;
  const perExample = Math.floor(BUDGET.examplesTotal / examples.length);
  const parts = examples.map((example, i) => {
    const body =
      `Kịch bản (trích):\n${truncateToBudget(example.scriptText, BUDGET.exampleScript)}\n\n` +
      `Kết quả phân tích đã duyệt (JSON):\n${JSON.stringify(compactScenes(example))}`;
    return `### Ví dụ ${i + 1}\n${truncateToBudget(body, perExample)}`;
  });
  return (
    "Dưới đây là các ví dụ phân tích đã được người dùng duyệt. Hãy bắt chước cách chia cảnh, độ dài cảnh, độ chi tiết của visualDescription và văn phong của chúng; KHÔNG sao chép nội dung của ví dụ vào kết quả.\n\n" +
    parts.join("\n\n")
  );
}

function documentsBlock(documents: DocumentRecord[]): string | null {
  const withText = documents.filter((d) => d.textContent.trim());
  if (withText.length === 0) return null;
  const perDocument = Math.min(BUDGET.document, Math.floor(BUDGET.documentsTotal / withText.length));
  const parts = withText.map(
    (doc) => `### Tài liệu: ${doc.title}\n${truncateToBudget(doc.textContent.trim(), perDocument)}`,
  );
  return (
    "Tài liệu tham khảo người dùng đính kèm (dùng làm kiến thức nền, ưu tiên thông tin trong đây khi phù hợp):\n\n" +
    parts.join("\n\n")
  );
}

/** Context blocks, each prefixed with a blank line, ready to append to a system prompt. */
export function buildContext(input: ContextInput): string {
  const blocks = [
    input.skill ? skillStyleLine(input.skill) : null,
    input.skill ? skillInstructionsBlock(input.skill) : null,
    examplesBlock(input.examples ?? []),
    documentsBlock(input.documents ?? []),
  ].filter((block): block is string => Boolean(block));
  return blocks.map((block) => `\n\n${block}`).join("");
}
