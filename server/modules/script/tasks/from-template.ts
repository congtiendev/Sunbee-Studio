import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type {
  DocumentRecord,
  ScriptAnalysisRecord,
  ScriptAnalyzeResult,
} from "../../../../shared/types.js";
import {
  buildContext,
  truncateToBudget,
  type ContextInput,
} from "../../../services/ai/context.js";
import type {
  AiEffort,
  ProviderKey,
} from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";
import { SCRIPT_ANALYSIS_SCHEMA } from "../schema.js";

export interface ScriptFromTemplateInput {
  template: ScriptAnalysisRecord;
  topic: string;
  documents: DocumentRecord[];
  targetDurationSec?: number;
  language: "vi" | "en";
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
  context?: ContextInput;
}

export interface ScriptFromTemplateResult extends ScriptAnalyzeResult {
  scriptText: string;
}

/** The analysis schema plus the full script text, written first so scenes follow it. */
const FROM_TEMPLATE_SCHEMA = {
  ...SCRIPT_ANALYSIS_SCHEMA,
  properties: {
    scriptText: { type: "string" },
    ...SCRIPT_ANALYSIS_SCHEMA.properties,
  },
  required: ["scriptText", ...SCRIPT_ANALYSIS_SCHEMA.required],
} as const;

const DOCUMENTS_BUDGET = 30_000;
const TEMPLATE_SCRIPT_BUDGET = 4_000;
/** Scenes shown in full as a sample of the template's level of detail. */
const SAMPLE_SCENES = 2;

const DEFAULT_SYSTEM_PROMPT =
  'Bạn là biên kịch video. Người dùng đưa cho bạn MỘT VIDEO MẪU đã được phân tích (cấu trúc cảnh, nhịp độ, cỡ cảnh, văn phong) và một CHỦ ĐỀ MỚI. Hãy viết một kịch bản mới cho chủ đề đó, rồi chia cảnh, sao cho video mới có cùng "công thức" với mẫu:\n' +
  "- Giữ số cảnh và chuỗi vai trò (narrativeRole) gần giống mẫu; thời lượng từng cảnh và tổng thời lượng tương tự (hoặc co giãn theo tỷ lệ nếu người dùng đặt thời lượng mục tiêu khác).\n" +
  "- Giữ nhịp cắt, tỷ lệ cỡ cảnh/chuyển động máy, vị trí cảnh cao trào (heroMoment) và cách mở đầu/kết thúc của mẫu.\n" +
  "- Bắt chước văn phong, độ dài câu, giọng điệu và mức độ chi tiết của visualDescription trong mẫu.\n" +
  "- Nội dung phải hoàn toàn thuộc về chủ đề mới: KHÔNG sao chép câu chữ, nhân vật, sản phẩm hay chi tiết riêng của mẫu. Nếu có tài liệu tham khảo, lấy thông tin/số liệu từ đó, không bịa.\n" +
  "- scriptText là toàn bộ kịch bản liền mạch (lời thoại/lời dẫn, có thể kèm ghi chú hình ảnh trong ngoặc vuông); content của từng cảnh là phần tương ứng của scriptText.\n" +
  "- requiredAssets của mỗi cảnh liệt kê tài nguyên cần chuẩn bị cho chủ đề mới; resources và style tóm tắt cho video mới.";

function totalDuration(record: ScriptAnalysisRecord): number {
  return record.scenes.reduce(
    (sum, scene) => sum + scene.estimatedDurationSec,
    0,
  );
}

/** The template's "recipe": structure table + pacing + a couple of full scenes. */
export function describeTemplate(template: ScriptAnalysisRecord): string {
  const total = totalDuration(template);
  const structure = template.scenes
    .map(
      (scene) =>
        `${scene.index}. ${scene.narrativeRole} · ${scene.estimatedDurationSec}s · ${scene.shotSize}/${scene.cameraMovement}${scene.heroMoment ? " · HERO" : ""}`,
    )
    .join("\n");
  const samples = template.scenes.slice(0, SAMPLE_SCENES).map((scene) => ({
    content: scene.content,
    visualDescription: scene.visualDescription,
    requiredAssets: scene.requiredAssets,
  }));
  const style = template.style
    ? `Phong cách mẫu: thể loại ${template.style.genre}; từ khoá ${template.style.styleTags.join(", ")}; tone: ${template.style.toneDescription}.`
    : "";
  return [
    `## Video mẫu`,
    `Tổng ${template.scenes.length} cảnh, khoảng ${total}s (${total > 0 ? ((template.scenes.length / total) * 60).toFixed(1) : "?"} cắt/phút).`,
    style,
    `### Cấu trúc cảnh (thứ tự · vai trò · thời lượng · cỡ cảnh/chuyển động)\n${structure}`,
    `### ${samples.length} cảnh đầu của mẫu (để tham khảo độ chi tiết, KHÔNG chép nội dung)\n${JSON.stringify(samples)}`,
    `### Kịch bản mẫu (trích, để tham khảo văn phong)\n${truncateToBudget(template.scriptText, TEMPLATE_SCRIPT_BUDGET)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const scriptFromTemplateTask = defineTask<
  ScriptFromTemplateInput,
  ScriptFromTemplateResult
>({
  key: "script.fromTemplate",
  module: "script",
  group: "template",
  label: {
    en: "Write a script from a template video",
    vi: "Viết kịch bản theo video mẫu",
  },
  description: {
    en: "Writes a new script on a new topic with the same structure, pacing and voice as an analyzed template video, already split into scenes.",
    vi: "Viết kịch bản mới cho chủ đề mới theo đúng cấu trúc, nhịp độ và văn phong của một video mẫu đã phân tích, chia cảnh sẵn.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const target = input.targetDurationSec ?? totalDuration(input.template);
    const perDocument = Math.floor(
      DOCUMENTS_BUDGET / Math.max(1, input.documents.length),
    );
    const documents = input.documents
      .map(
        (doc) =>
          `### Tài liệu: ${doc.title}\n${truncateToBudget(doc.textContent.trim(), perDocument)}`,
      )
      .join("\n\n");

    const text = [
      `## Chủ đề mới\n${input.topic.trim()}`,
      `Ngôn ngữ: ${input.language === "en" ? "tiếng Anh" : "tiếng Việt"}. Thời lượng mục tiêu: khoảng ${target}s.`,
      describeTemplate(input.template),
      documents ? `## Tài liệu tham khảo cho chủ đề mới\n${documents}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await providerFor(
      ctx,
      input.provider,
    ).generateStructured<ScriptFromTemplateResult>({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system") + buildContext(input.context ?? {}),
      text,
      effort: input.effort ?? "medium",
      schema: FROM_TEMPLATE_SCHEMA,
      schemaName: "script_from_template",
    });
    if (!result?.scriptText?.trim() || !result.scenes?.length) {
      throw new Error("AI không trả về kịch bản theo mẫu hợp lệ.");
    }
    return result;
  },
});
