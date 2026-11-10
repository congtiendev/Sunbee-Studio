import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import { SOURCE_NOTES_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface TrainGraphicsStyleInput {
  /** New example images (data URLs) read this run. */
  images: string[];
  /** The skill's current graphics style when re-training: refined, not rewritten from scratch. */
  currentGraphicsStyle?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface TrainGraphicsStyleOutput {
  graphicsStyle: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    graphicsStyle: { type: "string" },
  },
  required: ["graphicsStyle"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn phân tích phong cách ĐỒ HOẠ dùng chung của nhiều ảnh mẫu, để viết thành một bộ mô tả phong cách (skill) dùng làm kim chỉ nam mỗi khi AI tạo ảnh mới cho một video — sao cho ảnh mới ra đúng phong cách này dù vẽ chủ thể khác.\n\n" +
  "So sánh các ảnh với nhau: đặc điểm lặp lại ở hầu hết ảnh là phong cách cốt lõi; đặc điểm chỉ có ở một ảnh thường do chủ thể riêng của nó, bỏ qua.\n\n" +
  "Viết MỘT đoạn mô tả bằng tiếng Việt, cụ thể và làm theo được (không chung chung kiểu \"đẹp, ấn tượng\"), bao gồm những gì quan sát được trong ảnh:\n" +
  "- Chất liệu/kỹ thuật vẽ (vd. tranh giấy matte, 3D render, nét bút chì, vector phẳng...), nét viền (độ dày, màu, độ nhám).\n" +
  "- Bảng màu và ánh sáng chủ đạo.\n" +
  "- Tỉ lệ/hình khối nhân vật hoặc chủ thể nếu có (vd. đầu to, chibi, tả thực...).\n" +
  "- Xử lý nền (trong suốt, nền phẳng, nền chi tiết...) nếu quan sát được.\n" +
  "- Nếu nhiều ảnh cho thấy MỘT nhân vật/chủ thể xuất hiện lặp lại: ghi lại đặc điểm nhận diện cố định của nhân vật đó (trang phục, phụ kiện, màu tóc...) và lưu ý giữ đúng các chi tiết lệch bên (vd. đồng hồ tay trái) khi tạo ảnh ở góc/hướng khác, không lật gương máy móc.\n" +
  "- Nếu ảnh có dạng sprite sheet nhiều khung (hoạt hoạ một hành động): ghi lại đúng quy ước bố cục (số khung, số hàng/cột, thứ tự đọc) và nguyên tắc giữ nhân vật đồng nhất qua các khung.\n\n" +
  "Chỉ viết những gì QUAN SÁT ĐƯỢC từ ảnh, không suy đoán thêm. Trả về đúng JSON theo schema, không thêm giải thích, không markdown.";

const DEFAULT_REFINE_PROMPT =
  "Đây là lần HUẤN LUYỆN TÍCH LUỸ: skill này ĐÃ CÓ mô tả phong cách đồ hoạ (bên dưới), đúc kết từ các ảnh đã học trước đây. Hãy KẾT HỢP mô tả hiện tại với những gì các ảnh MỚI (ở trên) cho thấy — không kết luận chỉ từ ảnh mới, không viết lại từ đầu:\n" +
  "- Đặc điểm cũ được ảnh mới xác nhận → giữ nguyên.\n" +
  "- Ảnh mới cho thấy chi tiết khác với mô tả cũ → cân nhắc đây là biến thể (vd. một nhân vật khác trong cùng phong cách) hay là điều chỉnh/làm rõ thêm cho mô tả chung; chỉ thay hẳn một đặc điểm cốt lõi khi ảnh mới mâu thuẫn rõ ràng với ảnh cũ.\n" +
  "- Đặc điểm mới chưa có trong mô tả cũ → bổ sung.\n" +
  "- Không xoá một chi tiết chỉ vì ảnh mới không thể hiện lại nó.";

export const trainGraphicsStyleTask = defineTask<TrainGraphicsStyleInput, TrainGraphicsStyleOutput>({
  key: "training.graphicsStyle",
  module: "training",
  label: {
    en: "Train a graphics-style skill from example images",
    vi: "Huấn luyện skill đồ hoạ từ ảnh mẫu",
  },
  description: {
    en: "Reads many example images (vision) and writes their shared graphics-style methodology, saved as an image skill's graphicsStyle — or refines an existing one.",
    vi: "Đọc nhiều ảnh mẫu (vision) và viết phong cách đồ hoạ chung thành graphicsStyle của skill — hoặc tinh chỉnh skill đồ hoạ có sẵn.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
    {
      key: "refine",
      label: {
        en: "When re-training an existing skill",
        vi: "Khi huấn luyện lại skill có sẵn",
      },
      description: {
        en: "Added when re-training: merges the current graphics style with the newly read images (cumulative training).",
        vi: "Thêm vào khi huấn luyện lại: tổng hợp phong cách đồ hoạ hiện tại với các ảnh mới đọc (huấn luyện tích luỹ).",
      },
      default: DEFAULT_REFINE_PROMPT,
    },
  ],

  async run(input, ctx) {
    if (input.images.length === 0) {
      throw new Error("Cần ít nhất một ảnh mẫu để huấn luyện.");
    }
    const currentGraphicsStyle = input.currentGraphicsStyle?.trim();
    const refining = Boolean(currentGraphicsStyle);
    const system =
      promptOf(ctx, this, "system") +
      (refining
        ? `\n\n${promptOf(ctx, this, "refine")}\n\nMô tả phong cách hiện tại:\n"""\n${currentGraphicsStyle}\n"""`
        : "");

    const result = await providerFor(ctx, input.provider).generateStructured<TrainGraphicsStyleOutput>({
      model: input.model ?? defaultModelFor(input.provider),
      system,
      text: `Số ảnh mẫu mới: ${input.images.length}.`,
      images: input.images,
      imagesFirst: true,
      effort: input.effort ?? "medium",
      schema: SCHEMA,
      schemaName: "train_graphics_style",
      maxTokens: SOURCE_NOTES_OUTPUT_TOKENS,
    });
    if (!result || !result.graphicsStyle?.trim()) {
      throw new Error("AI không trả về mô tả phong cách hợp lệ.");
    }
    return result;
  },
});
