import { SCRIPT_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { DocumentRecord } from "../../../../shared/types.js";
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

export interface ScriptFromDocumentInput {
  /** The source material the script is written from. */
  documents: DocumentRecord[];
  brief?: string;
  targetDurationSec?: number;
  language: "vi" | "en";
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
  /** Skill style/instructions/examples (its own reference documents included). */
  context?: ContextInput;
}

/** Total characters of source material sent to the model. */
const SOURCE_BUDGET = 60_000;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là biên kịch video. Từ (các) tài liệu nguồn người dùng cung cấp, hãy viết MỘT kịch bản video hoàn chỉnh, sẵn sàng để đọc lời/quay dựng.\n" +
  "- Chỉ dùng thông tin có trong tài liệu nguồn (và kiến thức nền chung khi thật cần để câu văn trôi chảy); không bịa số liệu, tên riêng, trích dẫn.\n" +
  "- Chọn lọc ý quan trọng và hấp dẫn nhất phù hợp với thời lượng mục tiêu; không cố nhồi hết tài liệu.\n" +
  "- Cấu trúc rõ: mở đầu có hook giữ chân người xem trong vài giây đầu, phần thân triển khai ý chính theo mạch logic, kết thúc có điểm nhấn hoặc lời kêu gọi hành động.\n" +
  "- Viết theo văn nói, câu ngắn, dễ đọc thành lời. Có thể ghi chú hình ảnh gợi ý trong ngoặc vuông, ví dụ [cận cảnh sản phẩm], ngay trước câu thoại tương ứng.\n" +
  "- Ước lượng tốc độ đọc khoảng 150 từ/phút (tiếng Anh) hoặc 180 từ/phút (tiếng Việt) để khớp thời lượng.\n" +
  "Chỉ trả về nội dung kịch bản, không thêm lời mở đầu hay giải thích.";

function sourceBlock(documents: DocumentRecord[]): string {
  const perDocument = Math.floor(SOURCE_BUDGET / Math.max(1, documents.length));
  return documents
    .map(
      (doc) =>
        `### Tài liệu nguồn: ${doc.title}\n${truncateToBudget(doc.textContent.trim(), perDocument)}`,
    )
    .join("\n\n");
}

export const scriptFromDocumentTask = defineTask<
  ScriptFromDocumentInput,
  string
>({
  key: "script.fromDocument",
  module: "script",
  group: "document",
  label: {
    en: "Write a script from documents",
    vi: "Viết kịch bản từ tài liệu",
  },
  description: {
    en: "Writes a ready-to-record video script from uploaded reference documents, an optional brief and a target duration.",
    vi: "Viết kịch bản video hoàn chỉnh từ tài liệu đã tải lên, kèm yêu cầu (tuỳ chọn) và thời lượng mục tiêu.",
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
      input.brief?.trim()
        ? `Yêu cầu/góc nhìn của người dùng: ${input.brief.trim()}`
        : null,
    ].filter(Boolean);

    const text = await providerFor(ctx, input.provider).generateText({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system") + buildContext(input.context ?? {}),
      text: `${requirements.join("\n")}\n\n${sourceBlock(input.documents)}`,
      effort: input.effort ?? "medium",
      maxTokens: SCRIPT_OUTPUT_TOKENS,
    });
    const script = text.trim();
    if (!script) throw new Error("AI không trả về kịch bản.");
    return script;
  },
});
