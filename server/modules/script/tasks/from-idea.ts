import { SCRIPT_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import { buildContext, type ContextInput } from "../../../services/ai/context.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface ScriptFromIdeaInput {
  /** The user's idea, in their own words — the only source material there is. */
  idea: string;
  targetDurationSec?: number;
  language: "vi" | "en";
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
  /** Skill style/instructions/examples (its own reference documents included). */
  context?: ContextInput;
}

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là biên kịch video. Người dùng chỉ đưa ra MỘT Ý TƯỞNG ngắn (không có tài liệu nguồn) — hãy tự phát triển thành MỘT kịch bản video hoàn chỉnh, sẵn sàng để đọc lời/quay dựng.\n" +
  "- Được phép bổ sung chi tiết, ví dụ, lập luận dựa trên kiến thức nền chung để ý tưởng trở nên đầy đủ và hấp dẫn; nhưng TUYỆT ĐỐI không bịa số liệu cụ thể, trích dẫn, tên riêng hay sự kiện có thật mà bạn không chắc chắn — nếu cần một con số/dẫn chứng cụ thể mà không chắc, hãy viết chung chung thay vì bịa.\n" +
  "- Cấu trúc rõ: mở đầu có hook giữ chân người xem trong vài giây đầu, phần thân triển khai ý chính theo mạch logic, kết thúc có điểm nhấn hoặc lời kêu gọi hành động.\n" +
  "- Viết theo văn nói, câu ngắn, dễ đọc thành lời. Có thể ghi chú hình ảnh gợi ý trong ngoặc vuông, ví dụ [cận cảnh sản phẩm], ngay trước câu thoại tương ứng.\n" +
  "- Ước lượng tốc độ đọc khoảng 150 từ/phút (tiếng Anh) hoặc 180 từ/phút (tiếng Việt) để khớp thời lượng.\n" +
  "Chỉ trả về nội dung kịch bản, không thêm lời mở đầu hay giải thích.";

export const scriptFromIdeaTask = defineTask<ScriptFromIdeaInput, string>({
  key: "script.fromIdea",
  module: "script",
  group: "idea",
  label: {
    en: "Write a script from an idea",
    vi: "Viết kịch bản từ ý tưởng",
  },
  description: {
    en: "Writes a ready-to-record video script straight from a short idea, with no source documents.",
    vi: "Viết kịch bản video hoàn chỉnh thẳng từ một ý tưởng ngắn, không cần tài liệu nguồn.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const requirements = [
      `Ngôn ngữ kịch bản: ${input.language === "en" ? "tiếng Anh" : "tiếng Việt"}.`,
      input.targetDurationSec
        ? `Thời lượng mục tiêu: khoảng ${input.targetDurationSec} giây.`
        : "Thời lượng: tự chọn hợp lý cho video ngắn mạng xã hội (30–90 giây).",
    ].join("\n");

    const text = await providerFor(ctx, input.provider).generateText({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system") + buildContext(input.context ?? {}),
      text: `${requirements}\n\nÝ tưởng: ${input.idea.trim()}`,
      effort: input.effort ?? "medium",
      maxTokens: SCRIPT_OUTPUT_TOKENS,
    });
    const script = text.trim();
    if (!script) throw new Error("AI không trả về kịch bản.");
    return script;
  },
});
