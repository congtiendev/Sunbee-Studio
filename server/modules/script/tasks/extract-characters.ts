import { CHARACTER_ROSTER_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";

export interface ExtractCharactersInput {
  scriptText: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface CharacterRosterEntry {
  name: string;
  appearance: string;
}

export interface ObjectRosterEntry {
  name: string;
  appearance: string;
}

export interface ExtractCharactersOutput {
  characters: CharacterRosterEntry[];
  objects: ObjectRosterEntry[];
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
    objects: {
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
  required: ["characters", "objects"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn đọc TOÀN BỘ một kịch bản video và chốt trước danh sách NHÂN VẬT và VẬT PHẨM xuất hiện xuyên suốt. Danh sách này dùng cho hai việc: (1) kịch bản dài sẽ được chia nhỏ phân tích riêng từng đoạn — mọi đoạn phải dùng ĐÚNG MỘT tên nhất quán cho cùng một người/vật; (2) khi sau này cần TẠO ẢNH có người/vật đó ở nhiều cảnh khác nhau, mô tả bạn chốt ở đây sẽ được dùng lại y nguyên trong mọi lần tạo ảnh, để họ/nó trông giống hệt nhau xuyên suốt thay vì mỗi cảnh một hình dáng khác.\n\n" +
  "`characters` — NHÂN VẬT (người/con vật có vai trò riêng). Mỗi nhân vật gồm:\n" +
  "- `name`: tên/định danh ngắn gọn, nhất quán, dùng được xuyên suốt.\n" +
  "- `appearance`: mô tả NGOẠI HÌNH đầy đủ và cụ thể, đủ chi tiết để một người vẽ/tạo ảnh có thể vẽ ra đúng người này mỗi lần, giống hệt nhau xuyên suốt mọi cảnh. BẮT BUỘC luôn nêu rõ cả: độ tuổi (ước lượng), giới tính, khuôn mặt (hình dáng mặt, màu da, nét mặt nổi bật), kiểu tóc và màu tóc, vóc dáng/chiều cao, trang phục và phụ kiện đặc trưng (màu sắc, kiểu dáng cụ thể), phong cách thể hiện tổng thể (vd. hoạt hình 2D nét vẽ dày, mascot cách điệu, tả thực...), và bất kỳ đặc điểm nhận diện riêng nào (kính, sẹo, hình xăm...). Không mô tả hành động hay tính cách — chỉ ngoại hình.\n\n" +
  "`objects` — VẬT PHẨM/đồ vật đặc thù xuất hiện lặp lại hoặc được nhân vật cầm/tương tác, có hình dáng riêng cần giữ nguyên qua các cảnh (vd. vũ khí/đạo cụ của nhân vật, logo/sản phẩm thương hiệu, phương tiện đi lại, con thú cưng không có vai trò riêng như nhân vật, vật phẩm biểu tượng của video...). KHÔNG liệt kê bối cảnh/nền chung chung (văn phòng, thiên nhiên, đường phố...) hay đồ vật dùng một lần không cần nhận lại. Mỗi vật phẩm gồm:\n" +
  "- `name`: tên/định danh ngắn gọn, nhất quán.\n" +
  "- `appearance`: mô tả hình dáng CỤ THỂ (chất liệu, màu sắc, kích thước tương đối, chi tiết/hoạ tiết riêng, tình trạng cũ/mới), đủ để vẽ lại giống hệt mỗi lần.\n\n" +
  "Với cả hai danh sách: nếu kịch bản có nêu rõ chi tiết nào thì dùng đúng chi tiết đó. Chi tiết nào kịch bản KHÔNG nói rõ thì bạn PHẢI tự quyết định một lựa chọn cụ thể, hợp lý (vd. không rõ màu thì chọn hẳn một màu) — không được bỏ trống hay viết chung chung, vì mô tả này dùng y nguyên để tạo ảnh ở mọi cảnh.\n" +
  "Kịch bản không có nhân vật/vật phẩm nào đáng giữ nhận diện thì trả mảng rỗng tương ứng. Trả lời bằng cùng ngôn ngữ với kịch bản gốc.";

/**
 * Read the whole script once to lock in a consistent character AND object
 * roster, before a long script is split into chunks analyzed separately
 * (`service.ts`) — the chunks have no visibility into each other, so without
 * this they'd each invent their own look for the same person or prop.
 */
export const extractCharactersTask = defineTask<
  ExtractCharactersInput,
  ExtractCharactersOutput
>({
  key: "script.extractCharacters",
  module: "script",
  label: {
    en: "Extract the character & object roster",
    vi: "Chốt danh sách nhân vật & vật phẩm",
  },
  description: {
    en: "Reads the whole script once to list its characters and recurring objects/props with one consistent look each, before a long script is split and analyzed in separate chunks.",
    vi: "Đọc toàn bộ kịch bản một lần để chốt danh sách nhân vật và vật phẩm lặp lại với hình dáng nhất quán, trước khi kịch bản dài bị chia nhỏ phân tích riêng từng đoạn.",
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
      effort: input.effort ?? "low",
      schema: CHARACTER_ROSTER_SCHEMA,
      schemaName: "character_roster",
    });
    return result ?? { characters: [], objects: [] };
  },
});
