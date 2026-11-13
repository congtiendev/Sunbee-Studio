import { frameRatioForAi } from "../../../../shared/frame-ratio.js";
import { CLIP_TRANSITIONS, SHOT_KINDS } from "../../../../shared/render.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { FrameRatio, RenderScene } from "../../../../shared/types.js";
import { SCRIPT_WITH_SCENES_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface SplitRenderScenesInput {
  scriptText: string;
  frameRatio: FrameRatio;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}


const SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          durationSec: { type: "number" },
          shotKind: { type: "string", enum: SHOT_KINDS },
          captionStyle: { type: "string", enum: ["none", "lowerThird", "title"] },
          transitionOut: { type: "string", enum: CLIP_TRANSITIONS },
          imageHint: { type: "string" },
        },
        required: ["text", "durationSec", "shotKind", "captionStyle", "transitionOut", "imageHint"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là người dựng video ngắn bằng ẢNH TĨNH và CHỮ TRÊN MÀN HÌNH. Chia kịch bản được cho thành các cảnh liên tiếp, theo đúng thứ tự, KHÔNG bỏ sót và KHÔNG viết thêm nội dung.\n" +
  "- `text`: đúng câu/đoạn kịch bản của cảnh đó (có thể ngắt gọn cho dễ đọc nhưng giữ nguyên ý và lời). Mỗi cảnh 1–2 câu ngắn.\n" +
  "- `durationSec`: đủ để đọc hết chữ — khoảng 3 từ/giây tiếng Việt, tối thiểu 2 giây, tối đa 8 giây.\n" +
  "- `shotKind`: \"titleCard\" cho câu hook mở đầu, tiêu đề phần, lời kết/kêu gọi hành động; \"kenBurns\" cho phần lớn cảnh có ảnh (chuyển động nhẹ giữ nhịp); \"staticHold\" khi cần người xem nhìn kỹ một chi tiết; \"lowerThirdCaption\" khi chữ là điểm nhấn trên ảnh.\n" +
  "- `captionStyle`: \"title\" cho thẻ tiêu đề và câu cần nhấn mạnh, \"lowerThird\" cho lời dẫn bình thường, \"none\" nếu ảnh tự nói đủ.\n" +
  "- `transitionOut`: \"fade\" khi chuyển sang ý/phần mới, còn lại \"cut\".\n" +
  "- `imageHint`: mô tả ngắn, cụ thể bức ảnh cảnh đó cần (chủ thể, bối cảnh, góc nhìn) để người dùng tìm hoặc tạo ảnh; để trống với titleCard không cần ảnh nền.\n" +
  "- Ghi chú hình ảnh trong ngoặc vuông của kịch bản (vd. [cận cảnh sản phẩm]) KHÔNG đưa vào `text` — dùng làm gợi ý cho `imageHint` của cảnh tương ứng.";

export const splitRenderScenesTask = defineTask<SplitRenderScenesInput, RenderScene[]>({
  key: "videoRender.splitScenes",
  module: "videoRender",
  label: { en: "Split the script into scenes", vi: "Chia kịch bản thành cảnh" },
  description: {
    en: "Video render: breaks the script into on-screen scenes — text, length, shot type, caption style, transition and the picture each needs.",
    vi: "Dựng video: chia kịch bản thành các cảnh trên màn hình — chữ, thời lượng, kiểu shot, kiểu phụ đề, chuyển cảnh và ảnh cần cho từng cảnh.",
  },
  prompts: [{ key: "system", label: { en: "Main instructions", vi: "Hướng dẫn chính" }, default: DEFAULT_SYSTEM_PROMPT }],

  async run(input, ctx) {
    const result = await providerFor(ctx, input.provider).generateStructured<{ scenes: RenderScene[] }>({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: `Khung hình video: ${frameRatioForAi(input.frameRatio)}.\n\nKịch bản:\n${input.scriptText.trim()}`,
      effort: input.effort ?? "medium",
      maxTokens: SCRIPT_WITH_SCENES_OUTPUT_TOKENS,
      schema: SCHEMA,
      schemaName: "render_scenes",
    });
    if (!result?.scenes?.length) throw new Error("AI không chia được cảnh nào.");
    const scenes = result.scenes
      .filter((scene) => scene.text.trim())
      .map((scene) => ({
        ...scene,
        durationSec: Math.min(30, Math.max(1, Number(scene.durationSec) || 3)),
        shotKind: SHOT_KINDS.includes(scene.shotKind) ? scene.shotKind : "kenBurns",
      }));
    if (scenes.length === 0) throw new Error("AI không chia được cảnh nào.");
    return scenes;
  },
});
