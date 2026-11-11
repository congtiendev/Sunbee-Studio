import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface ImagePromptInput {
  /** The asset description as the user typed it — often Vietnamese. */
  description: string;
  sceneContext?: string;
  /** Style reference images (data URLs, up to 10) — describe their *style*, not their subject, into the prompt. */
  referenceImages?: string[];
  /** A type "image" skill's locked graphics methodology for the whole video — a hard style constraint, not scene detail. */
  graphicsStyle?: string;
  /** Real photos/drawings of specific characters appearing in this request — unlike `referenceImages`, their actual identity (face, look) IS what must carry over, not just a style. */
  characterReferenceImages?: { name: string; image: string }[];
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
  "Nếu có kèm (một hoặc nhiều) ảnh mẫu PHONG CÁCH: các ảnh đó CHỈ để tham khảo PHONG CÁCH thị giác (kiểu vẽ/chất liệu, bảng màu, nét cọ/độ chi tiết, ánh sáng, mood) — tuyệt đối không mô tả hay giữ lại chủ thể/nội dung của bất kỳ ảnh mẫu nào. Hãy mô tả phong cách chung rút ra từ các ảnh đó thành từ ngữ cụ thể rồi ghép vào cuối prompt (vd. \"in the style of a soft pastel watercolor illustration with warm backlighting\").\n" +
  "Nếu có kèm ẢNH NHÂN VẬT THẬT (mỗi ảnh gắn với đúng một tên nhân vật, nêu rõ trong mô tả bên dưới theo thứ tự ảnh): đây là ẢNH THẬT của nhân vật đó — NGƯỢC LẠI với ảnh mẫu phong cách, ở đây bạn PHẢI mô tả cụ thể khuôn mặt, kiểu tóc, vóc dáng, trang phục và mọi đặc điểm nhận diện quan sát được trong ảnh, để người/model vẽ ra đúng người này — không tự đặt lại ngoại hình khác với ảnh. Nếu mô tả tài nguyên cũng có ghi ngoại hình, ảnh thật vẫn được ưu tiên hơn khi có mâu thuẫn.\n" +
  "Nếu có \"Phong cách đồ hoạ cố định\": đây là phong cách BẮT BUỘC áp dụng cho TOÀN BỘ video, do người dùng chọn trước — phải tuân theo NGHIÊM NGẶT và đầy đủ (màu sắc, nét vẽ, tỉ lệ, quy tắc nhận diện nhân vật...), không được tóm tắt qua loa hay bỏ bớt chi tiết. Đây không phải mô tả cảnh thông thường — ưu tiên cao hơn mô tả cảnh nếu có xung đột.\n" +
  "Đồng thời xác định SỐ LƯỢNG ảnh người dùng muốn (field `count`): nếu mô tả có nêu rõ số lượng hoặc ý muốn nhiều biến thể (vd. \"tạo 5 ảnh\", \"cho tôi vài tấm\", \"3 biến thể\"), trả về đúng số đó (ước lượng hợp lý nếu chỉ nói chung chung như \"vài\"/\"một số\"). Nếu KHÔNG đề cập số lượng, trả về count = 1.\n" +
  "Trả về đúng JSON theo schema, không thêm giải thích, không markdown.";

export const imagePromptTask = defineTask<ImagePromptInput, ImagePromptOutput>({
  key: "asset.imagePrompt",
  module: "assets",
  label: { en: "AI image generation prompt", vi: "Prompt sinh ảnh AI" },
  description: {
    en: "Rewrites an asset description (any language) into an English prompt FLUX understands, reads off how many variations were asked for, and — when a character's real reference photo is attached — describes their actual look instead of style-reference images (described for style only).",
    vi: "Viết lại mô tả tài nguyên (bất kỳ ngôn ngữ nào) thành prompt tiếng Anh mà FLUX hiểu được, kèm số lượng ảnh được yêu cầu — và khi có ảnh thật của nhân vật đính kèm, mô tả đúng ngoại hình của họ thay vì chỉ lấy phong cách như ảnh mẫu thường.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const styleImages = input.referenceImages ?? [];
    const characterImages = input.characterReferenceImages ?? [];
    const images = [...styleImages, ...characterImages.map((c) => c.image)];
    const result = await providerFor(ctx, input.provider).generateStructured<ImagePromptOutput>({
      model: defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: [
        `Mô tả tài nguyên: ${input.description}`,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
        styleImages.length
          ? `Có kèm ${styleImages.length} ảnh mẫu phong cách ở trên — chỉ lấy phong cách, không lấy nội dung.`
          : null,
        characterImages.length
          ? `Có kèm ${characterImages.length} ảnh nhân vật thật, theo đúng thứ tự sau ảnh mẫu phong cách (nếu có), lần lượt là: ${characterImages.map((c) => c.name).join(", ")}.`
          : null,
        input.graphicsStyle ? `Phong cách đồ hoạ cố định (bắt buộc áp dụng cho toàn bộ video): ${input.graphicsStyle}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      images: images.length ? images : undefined,
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
