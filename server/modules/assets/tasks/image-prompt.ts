import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface ImagePromptInput {
  /** The asset description as the user typed it — often Vietnamese. */
  description: string;
  sceneContext?: string;
  /** A style reference image (data URL) — describe its *style*, not its subject, into the prompt. */
  referenceImage?: string;
  provider: ProviderKey;
}

export interface ImagePromptOutput {
  /** The rewritten English prompt. */
  prompt: string;
  /** How many variations the description asked for; 1 when it didn't say. */
  count: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    count: { type: "integer", minimum: 1 },
  },
  required: ["prompt", "count"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn viết prompt cho model sinh ảnh AI (FLUX). Model này chỉ hiểu tốt tiếng Anh — mô tả bằng ngôn ngữ khác (vd. tiếng Việt) thường bị hiểu sai hoàn toàn, ra ảnh không liên quan.\n" +
  "Từ mô tả tài nguyên của một cảnh video (có thể bằng tiếng Việt), viết lại thành MỘT prompt bằng TIẾNG ANH, 1-2 câu, mô tả cụ thể chủ thể, hành động/tư thế, bối cảnh, ánh sáng và phong cách hình ảnh (vd. photo, illustration, 3D render...).\n" +
  "Ảnh ra luôn là khung VUÔNG. Nếu chủ thể có hình dạng dài/chéo (vd. búa, kiếm, người nằm, cây gậy...), BẮT BUỘC thêm vào prompt các từ khoá đảm bảo toàn bộ chủ thể nằm gọn trong khung, không bị cắt ở cạnh ảnh — vd. \"the entire object fully visible within frame\", \"nothing cropped at the edges\", \"comfortable padding around the subject\", \"zoomed out enough to fit the whole item\" — và cân nhắc xoay chủ thể theo chiều phù hợp với khung vuông (vd. đặt chéo góc hoặc dựng đứng) thay vì chiều ngang dài hết cỡ.\n" +
  "LƯU Ý: model KHÔNG hỗ trợ nền trong suốt thật (không xuất file có alpha channel) — nếu mô tả có yêu cầu \"xoá nền\"/\"nền trong suốt\", đừng hứa hẹn điều đó trong prompt; thay vào đó dùng \"on a plain, solid, uncluttered background, studio product photography\" để dễ tách nền thủ công sau, và không nhắc đến \"transparent background\".\n" +
  "Nếu có kèm một ảnh mẫu: ảnh đó CHỈ để tham khảo PHONG CÁCH thị giác (kiểu vẽ/chất liệu, bảng màu, nét cọ/độ chi tiết, ánh sáng, mood) — tuyệt đối không mô tả hay giữ lại chủ thể/nội dung của ảnh mẫu. Hãy mô tả phong cách đó thành từ ngữ cụ thể rồi ghép vào cuối prompt (vd. \"in the style of a soft pastel watercolor illustration with warm backlighting\").\n" +
  "Đồng thời xác định SỐ LƯỢNG ảnh người dùng muốn (field `count`): nếu mô tả có nêu rõ số lượng hoặc ý muốn nhiều biến thể (vd. \"tạo 5 ảnh\", \"cho tôi vài tấm\", \"3 biến thể\"), trả về đúng số đó (ước lượng hợp lý nếu chỉ nói chung chung như \"vài\"/\"một số\"). Nếu KHÔNG đề cập số lượng, trả về count = 1.\n" +
  "Trả về đúng JSON theo schema, không thêm giải thích, không markdown.";

export const imagePromptTask = defineTask<ImagePromptInput, ImagePromptOutput>({
  key: "asset.imagePrompt",
  module: "assets",
  label: { en: "AI image generation prompt", vi: "Prompt sinh ảnh AI" },
  description: {
    en: "Rewrites an asset description (any language) into an English prompt FLUX understands, and reads off how many variations were asked for.",
    vi: "Viết lại mô tả tài nguyên (bất kỳ ngôn ngữ nào) thành prompt tiếng Anh mà FLUX hiểu được, kèm số lượng ảnh được yêu cầu.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const result = await providerFor(ctx, input.provider).generateStructured<ImagePromptOutput>({
      model: defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: [
        `Mô tả tài nguyên: ${input.description}`,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
        input.referenceImage ? "Có kèm ảnh mẫu phong cách ở trên — chỉ lấy phong cách, không lấy nội dung." : null,
      ]
        .filter(Boolean)
        .join("\n"),
      images: input.referenceImage ? [input.referenceImage] : undefined,
      effort: "low",
      schema: SCHEMA,
      schemaName: "image_prompt",
    });
    return {
      prompt: result?.prompt?.trim() || input.description,
      count: Math.max(1, Math.round(result?.count ?? 1)),
    };
  },
});
