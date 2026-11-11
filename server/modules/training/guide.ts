import type {
  ScriptScene,
  SkillSnapshot,
  StyleTemplate,
} from "../../../shared/types.js";
import type { TrainingMaterial } from "./sources/types.js";
import type { TrainSkillOutput } from "./tasks/train-skill.js";

/**
 * The skill's instructions: one titled section per guide the AI wrote, so a
 * person can read and edit them, plus how much it learned from.
 */
export function instructionsOf(
  output: TrainSkillOutput,
  materials: TrainingMaterial[],
): string {
  const sections = [
    ["Giọng văn", output.voiceGuide],
    ["Phong cách & cấu trúc", output.styleGuide],
    ["Phong cách hình ảnh & dựng", output.visualGuide],
    ["Kiến thức & quy tắc từ tài liệu", output.knowledgeGuide],
  ]
    .filter(([, body]) => body?.trim())
    .map(([title, body]) => `## ${title}\n${body!.trim()}`);

  const samples = output.sampleLines.map((line) => line.trim()).filter(Boolean);
  if (samples.length > 0) {
    sections.push(
      `## Câu mẫu để cảm giọng (không chép lại nguyên văn)\n${samples.map((line) => `- "${line}"`).join("\n")}`,
    );
  }

  const scripts = materials.filter((m) => m.role === "sample").length;
  const references = materials.length - scripts;
  sections.push(`_Học từ ${scripts} kịch bản và ${references} tài liệu._`);
  return sections.join("\n\n");
}

function pacingOf(scenes: ScriptScene[]) {
  const totalSec = scenes.reduce(
    (sum, scene) => sum + scene.estimatedDurationSec,
    0,
  );
  return {
    avgShotLengthSec: scenes.length > 0 ? totalSec / scenes.length : 0,
    cutsPerMinute: totalSec > 0 ? (scenes.length / totalSec) * 60 : 0,
  };
}

/** Measured pacing across every analyzed sample; nothing when none was analyzed. */
export function measuredPacing(materials: TrainingMaterial[]) {
  const scenes = materials.flatMap((m) => m.scenes ?? []);
  return scenes.length > 0 ? { pacing: pacingOf(scenes) } : {};
}

/** The skill fields a version keeps, enough to restore it. */
export function snapshotOf(skill: StyleTemplate): SkillSnapshot {
  return {
    name: skill.name,
    description: skill.description ?? "",
    type: skill.type ?? "script",
    genre: skill.genre,
    styleTags: skill.styleTags,
    toneDescription: skill.toneDescription,
    instructions: skill.instructions ?? "",
    graphicsStyle: skill.graphicsStyle ?? "",
    editingStyle: skill.editingStyle ?? "",
    pacing: skill.pacing,
    resourceInventory: skill.resourceInventory,
  };
}
