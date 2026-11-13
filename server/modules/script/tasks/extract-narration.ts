import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ScriptScene } from "../../../../shared/types.js";
import { ANALYSIS_PASSAGE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";
import { NARRATION_RULE } from "../schema.js";

export interface ExtractNarrationInput {
  /** The whole script — the narration is copied out of it verbatim. */
  scriptText: string;
  /** The scenes to fill in (a batch of an existing analysis). */
  scenes: ScriptScene[];
  /** What happens in the scene right before this batch (batches run in parallel), so the batch starts after it. */
  previousSceneContent?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface ExtractNarrationOutput {
  scenes: { index: number; narration: string }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          narration: { type: "string" },
        },
        required: ["index", "narration"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Một kịch bản video đã được chia thành các cảnh (mỗi cảnh có content tóm nội dung và visualDescription tả hình), nhưng chưa ghi riêng lời đọc của từng cảnh. " +
  "Với MỖI cảnh được giao, tìm trong kịch bản gốc đoạn lời tương ứng với cảnh đó và trả về `narration`.\n" +
  NARRATION_RULE +
  "\nCác cảnh được giao là một đoạn LIÊN TIẾP: cảnh đầu tiên bắt đầu ngay sau phần lời của cảnh trước (nếu được cho), các cảnh sau nối tiếp không chồng lấn. Trả về đúng các `index` được giao.";

export const extractNarrationTask = defineTask<ExtractNarrationInput, ExtractNarrationOutput>({
  key: "script.extractNarration",
  module: "script",
  group: "analyze",
  label: {
    en: "Extract each scene's narration",
    vi: "Tách lời đọc của từng cảnh",
  },
  description: {
    en: "Copies, for each scene of an existing analysis, the exact words spoken in it from the script — the text the voiceover is synthesized from.",
    vi: "Chép từ kịch bản đúng phần lời được đọc trong từng cảnh của một bản phân tích có sẵn — văn bản mà giọng đọc AI sẽ đọc.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const scenes = input.scenes.map((scene) => ({
      index: scene.index,
      content: scene.content,
      visualDescription: scene.visualDescription,
    }));
    const result = await providerFor(ctx, input.provider).generateStructured<ExtractNarrationOutput>({
      maxTokens: ANALYSIS_PASSAGE_OUTPUT_TOKENS,
      model: input.model ?? defaultModelFor(input.provider),
      effort: input.effort ?? "low",
      system: promptOf(ctx, this, "system"),
      text: [
        `KỊCH BẢN GỐC:\n${input.scriptText}`,
        input.previousSceneContent?.trim()
          ? `Nội dung cảnh ngay trước (CHỈ để biết chỗ bắt đầu, KHÔNG trả về): ${input.previousSceneContent.trim()}`
          : "Đây là các cảnh đầu tiên của kịch bản.",
        `CÁC CẢNH CẦN TÁCH LỜI ĐỌC:\n${JSON.stringify(scenes, null, 2)}`,
      ].join("\n\n"),
      schema: SCHEMA,
      schemaName: "scene_narration",
    });
    if (!result?.scenes?.length) throw new Error("AI không trả về lời đọc của các cảnh.");
    return result;
  },
});
