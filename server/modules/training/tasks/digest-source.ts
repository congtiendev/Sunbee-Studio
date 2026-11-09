import { SOURCE_NOTES_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type {
  AiEffort,
  ProviderKey,
} from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";
import type { MaterialRole, SourceDigest } from "../sources/types.js";

export interface DigestSourceInput {
  title: string;
  role: MaterialRole;
  /** The part of the source to read (the whole source when it fits). */
  text: string;
  /** 1-based part number and count, when a long source is read in parts. */
  part: number;
  parts: number;
  /** Compact scenes JSON of the source's analysis, given with the first part only. */
  scenesJson?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export type DigestSourceOutput = Omit<SourceDigest, "chars" | "parts">;

const DIGEST_SCHEMA = {
  type: "object",
  properties: {
    voice: { type: "array", items: { type: "string" } },
    structure: { type: "array", items: { type: "string" } },
    visual: { type: "array", items: { type: "string" } },
    knowledge: { type: "array", items: { type: "string" } },
    sampleLines: { type: "array", items: { type: "string" } },
  },
  required: ["voice", "structure", "visual", "knowledge", "sampleLines"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là biên tập viên kịch bản. Bạn đọc TOÀN BỘ một phần của một nguồn dùng để huấn luyện skill viết kịch bản, rồi ghi chú lại để bước sau tổng hợp nhiều nguồn thành một bộ hướng dẫn. Ghi chú phải CỤ THỂ, quan sát được trong văn bản, kèm dẫn chứng ngắn trong ngoặc kép khi có thể; tránh nhận xét chung chung.\n\n" +
  "Trả về các danh sách gạch đầu dòng ngắn:\n" +
  "- voice: GIỌNG VĂN — ngôi kể, xưng hô với người xem, độ dài/nhịp câu, khẩu ngữ, từ và cụm từ đặc trưng hay lặp lại, biện pháp tu từ, cách gây cười/cảm xúc, cách ngắt nhịp để đọc thành lời.\n" +
  "- structure: CẤU TRÚC — hook mở đầu, cách triển khai và chuyển ý, nhịp thông tin, cao trào, cách kết/kêu gọi hành động, chèn quảng cáo, những gì tác giả tránh. Nếu đây chỉ là một phần của nguồn, ghi rõ phần này nằm ở đầu/giữa/cuối.\n" +
  "- visual: PHONG CÁCH HÌNH ẢNH & DỰNG — chỉ khi có dữ liệu phân cảnh hoặc ghi chú hình ảnh trong văn bản; nếu không thì để rỗng.\n" +
  "- knowledge: với tài liệu tham khảo — quy tắc viết được nêu rõ (nên/không nên, từ cấm…) và kiến thức cốt lõi cần nhớ; với kịch bản thì thường để rỗng.\n" +
  "- sampleLines: 2–4 câu NGẮN trích nguyên văn thể hiện rõ nhất chất giọng.\n\n" +
  "Mô tả CÁCH viết, không tóm tắt NỘI DUNG. Viết bằng tiếng Việt.";

/**
 * Map step of training on long material: reads one source — or one part of a
 * long one — in full and notes its voice, structure, visual style and knowledge.
 * The training task then synthesizes these notes instead of truncated text.
 */
export const digestSourceTask = defineTask<
  DigestSourceInput,
  DigestSourceOutput
>({
  key: "training.digest",
  module: "training",
  label: {
    en: "Read one long source for training",
    vi: "Đọc một nguồn dài để huấn luyện",
  },
  description: {
    en: "When the material is too long for one call (e.g. several long scripts), each source is read in full — long ones part by part — and noted here; training then merges the notes. Notes are cached per source.",
    vi: "Khi nguồn quá dài cho một lần gọi (VD: nhiều kịch bản dài), từng nguồn được đọc trọn vẹn — nguồn dài đọc theo từng phần — và ghi chú lại ở bước này; bước huấn luyện sau đó tổng hợp các ghi chú. Ghi chú được lưu lại cho mỗi nguồn.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const kind = input.role === "sample" ? "Kịch bản" : "Tài liệu tham khảo";
    const partLine =
      input.parts > 1 ? ` — phần ${input.part}/${input.parts}` : "";
    const result = await providerFor(
      ctx,
      input.provider,
    ).generateStructured<DigestSourceOutput>({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text:
        `${kind}: ${input.title}${partLine}\n"""\n${input.text}\n"""` +
        (input.scenesJson
          ? `\n\nPhân cảnh của nguồn này (JSON rút gọn): ${input.scenesJson}`
          : ""),
      effort: input.effort ?? "low",
      schema: DIGEST_SCHEMA,
      schemaName: "training_digest",
      maxTokens: SOURCE_NOTES_OUTPUT_TOKENS,
    });
    if (!result) throw new Error(`AI không đọc được nguồn "${input.title}".`);
    return result;
  },
});
