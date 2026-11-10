import { CHARACTER_ROSTER_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";

export interface ExtractCharactersInput {
  scriptText: string;
  provider: ProviderKey;
  model?: string;
}

export interface CharacterRosterEntry {
  name: string;
  appearance: string;
}

export interface ExtractCharactersOutput {
  characters: CharacterRosterEntry[];
}

const CHARACTER_ROSTER_SCHEMA = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          appearance: { type: "string" },
        },
        required: ["name", "appearance"],
        additionalProperties: false,
      },
    },
  },
  required: ["characters"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn đọc TOÀN BỘ một kịch bản video và chốt trước danh sách NHÂN VẬT (người/con vật có vai trò riêng) xuất hiện xuyên suốt. Danh sách này dùng cho hai việc: (1) kịch bản dài sẽ được chia nhỏ phân tích riêng từng đoạn — mọi đoạn phải dùng ĐÚNG MỘT tên nhất quán cho cùng một người; (2) khi sau này cần TẠO ẢNH cho nhân vật đó ở nhiều cảnh khác nhau, mô tả bạn chốt ở đây sẽ được dùng lại y nguyên trong mọi lần tạo ảnh, để họ trông giống cùng một người xuyên suốt thay vì mỗi cảnh một gương mặt/trang phục khác.\n" +
  "Mỗi nhân vật gồm:\n" +
  "- `name`: tên/định danh ngắn gọn, nhất quán, dùng được xuyên suốt.\n" +
  "- `appearance`: mô tả NGOẠI HÌNH cụ thể, đủ chi tiết để một người vẽ/tạo ảnh có thể vẽ ra đúng người này mỗi lần — độ tuổi, giới tính, kiểu tóc/màu tóc, vóc dáng, trang phục và phụ kiện đặc trưng (màu sắc, kiểu dáng cụ thể nếu kịch bản có nêu), đặc điểm nhận diện riêng (kính, sẹo, hình xăm, màu da...). CHỈ ghi những gì kịch bản thực sự thể hiện hoặc gợi ý hợp lý được; không bịa chi tiết không có căn cứ. Không mô tả hành động hay tính cách ở đây — chỉ ngoại hình.\n" +
  "Không liệt kê bối cảnh, đồ vật hay địa điểm. Kịch bản không có ai xuất hiện (chỉ kể chuyện qua hình ảnh/b-roll, không có người/con vật nào đóng vai trò riêng) thì trả mảng rỗng. Trả lời bằng cùng ngôn ngữ với kịch bản gốc.";

/**
 * Read the whole script once to lock in a consistent character roster, before
 * a long script is split into chunks analyzed separately (`service.ts`) — the
 * chunks have no visibility into each other, so without this they'd each
 * invent their own names for the same character.
 */
export const extractCharactersTask = defineTask<
  ExtractCharactersInput,
  ExtractCharactersOutput
>({
  key: "script.extractCharacters",
  module: "script",
  label: {
    en: "Extract the character roster",
    vi: "Chốt danh sách nhân vật",
  },
  description: {
    en: "Reads the whole script once to list its characters with one consistent name each, before a long script is split and analyzed in separate chunks.",
    vi: "Đọc toàn bộ kịch bản một lần để chốt danh sách nhân vật với tên nhất quán, trước khi kịch bản dài bị chia nhỏ phân tích riêng từng đoạn.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const provider = providerFor(ctx, input.provider);
    const result = await provider.generateStructured<ExtractCharactersOutput>({
      maxTokens: CHARACTER_ROSTER_OUTPUT_TOKENS,
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: input.scriptText,
      effort: "low",
      schema: CHARACTER_ROSTER_SCHEMA,
      schemaName: "character_roster",
    });
    return result ?? { characters: [] };
  },
});
