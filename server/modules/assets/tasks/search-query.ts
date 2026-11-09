import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ResearchMediaType } from "../../../../shared/types.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface SearchQueryInput {
  description: string;
  sceneContext?: string;
  mediaType: ResearchMediaType;
  provider: ProviderKey;
}

const QUERY_SCHEMA = {
  type: "object",
  properties: { queries: { type: "array", items: { type: "string" } } },
  required: ["queries"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn giúp tìm tư liệu trên các kho ảnh/video miễn phí (Pexels, Pixabay). Từ mô tả tài nguyên cần có của một cảnh video (có thể bằng tiếng Việt), hãy tạo 3 cụm từ khoá tìm kiếm bằng TIẾNG ANH, mỗi cụm 2–5 từ, sắp xếp từ cụ thể nhất đến chung nhất.\n" +
  "- Chỉ mô tả những gì nhìn/nghe thấy được (chủ thể, hành động, bối cảnh, ánh sáng, góc máy); bỏ tên riêng, thương hiệu, chữ trên màn hình vì kho stock không có.\n" +
  "- Không dùng dấu ngoặc, toán tử hay dấu câu.";

export const searchQueryTask = defineTask<SearchQueryInput, string[]>({
  key: "asset.searchQuery",
  module: "assets",
  label: { en: "Stock search keywords", vi: "Từ khoá tìm kho stock" },
  description: {
    en: "Turns a scene's required-asset description into English keywords for Pexels/Pixabay.",
    vi: "Chuyển mô tả tài nguyên cần có của cảnh thành từ khoá tiếng Anh để tìm trên Pexels/Pixabay.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const result = await providerFor(ctx, input.provider).generateStructured<{ queries: string[] }>({
      model: defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: [
        `Loại tài nguyên: ${input.mediaType}`,
        `Mô tả tài nguyên: ${input.description}`,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      effort: "low",
      schema: QUERY_SCHEMA,
      schemaName: "stock_queries",
    });
    return (result?.queries ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 5);
  },
});
