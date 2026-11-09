import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { AiWebSearchResult, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface WebResearchInput {
  /** What the user typed in the research box (defaults to the asset description). */
  query: string;
  description?: string;
  sceneContext?: string;
  provider: ProviderKey;
}

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là trợ lý nghiên cứu tư liệu cho một video. Hãy tìm trên web các nguồn giúp người dựng chuẩn bị tài nguyên được mô tả: trang có ảnh/video/âm thanh dùng được (ưu tiên nguồn miễn phí hoặc có giấy phép rõ ràng như Creative Commons, Wikimedia Commons, trang báo chí/hãng chính thức có bộ ảnh press), số liệu hoặc dữ kiện cần kiểm chứng, và ví dụ tham khảo về cách quay/dựng.\n" +
  "Trả lời ngắn gọn bằng tiếng Việt, dạng gạch đầu dòng: mỗi gợi ý nêu nguồn là gì, dùng được cho việc gì, và lưu ý về bản quyền/giấy phép nếu có. Chỉ nêu những gì bạn thực sự tìm thấy, kèm trích dẫn nguồn.";

export const webResearchTask = defineTask<WebResearchInput, AiWebSearchResult>({
  key: "asset.webResearch",
  module: "assets",
  label: { en: "Web research for an asset", vi: "Research tài nguyên trên web" },
  description: {
    en: "Searches the web (OpenAI or Claude web search) for sources, references and licensing notes for one required asset.",
    vi: "Tìm trên web (web search của OpenAI hoặc Claude) các nguồn, tư liệu tham khảo và lưu ý bản quyền cho một tài nguyên cần có.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    return providerFor(ctx, input.provider).webSearch({
      model: defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: [
        `Cần tìm: ${input.query}`,
        input.description && input.description !== input.query
          ? `Mô tả tài nguyên: ${input.description}`
          : null,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  },
});
