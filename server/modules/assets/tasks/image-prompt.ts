import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import { frameRatioForAi } from "../../../../shared/frame-ratio.js";
import type { FrameRatio, ImageLayer } from "../../../../shared/types.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
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
  /** The video's frame — the prompt composes for it. Omitted: square (a general, non-video asset). */
  frameRatio?: FrameRatio;
  /** Chosen by the user; omitted lets the AI decide (see the "LOẠI ẢNH" rule). */
  layer?: ImageLayer;
  /** How the image sits in its scene: camera angle, position, perspective (see `RequiredAsset.placement`). */
  placement?: string;
  /** The shot the image is for (`describeShotForAi`): its framing wins over the scene's. */
  shot?: string;
  /**
   * The style lives in a skill attached elsewhere (the ChatGPT pack's skill
   * file): the prompt describes content only, no style words at all.
   */
  styleFromSkill?: boolean;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface ImagePromptOutput {
  /** The rewritten English prompt. */
  prompt: string;
  /** How many variations the description asked for; 1 when it didn't say. */
  count: number;
  /** A whole frame of the scene, or the subject alone for a transparent PNG. */
  layer: ImageLayer;
}

const SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    count: { type: "integer", minimum: 1 },
    layer: { type: "string", enum: ["scene", "cutout"] },
  },
  required: ["prompt", "count", "layer"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn viết prompt cho model sinh ảnh AI (FLUX). Model này chỉ hiểu tốt tiếng Anh — mô tả bằng ngôn ngữ khác (vd. tiếng Việt) thường bị hiểu sai hoàn toàn, ra ảnh không liên quan.\n" +
  "Từ mô tả tài nguyên của một cảnh video (có thể bằng tiếng Việt), viết lại thành MỘT prompt bằng TIẾNG ANH, 1-2 câu, mô tả cụ thể chủ thể, hành động/tư thế, bối cảnh, ánh sáng và phong cách hình ảnh (vd. photo, illustration, 3D render...).\n" +
  "CHỮ TRONG ẢNH: chữ cần hiện trong ảnh (thường nằm trong ngoặc kép/nháy đơn của mô tả — tin nhắn, thông báo, biển hiệu, tiêu đề...) phải giữ NGUYÊN VĂN, ĐÚNG ngôn ngữ gốc kèm đủ dấu (vd. tiếng Việt) — TUYỆT ĐỐI KHÔNG dịch sang tiếng Anh hay viết lại. Ghi vào prompt dạng: with the exact Vietnamese text \"…\" written verbatim with all diacritics.\n" +
  "PHONG CÁCH: từ ngữ về phong cách vẽ nằm trong mô tả tài nguyên hay bối cảnh cảnh quay (vd. \"hoạt hình 2D\", \"nét viền đen dày\", \"màu phẳng\", \"2D cartoon\") chỉ là ghi chú lúc phân tích, KHÔNG phải yêu cầu — bỏ qua chúng. Phong cách chỉ lấy từ \"Phong cách đồ hoạ cố định\" hoặc ảnh mẫu phong cách. Nếu có mục \"Phong cách: do skill đính kèm quyết định\" thì KHÔNG viết bất kỳ từ ngữ nào về phong cách, nét vẽ, chất liệu hay bảng màu tổng thể vào prompt — chỉ mô tả nội dung. Chỉ khi không có cả ba thứ trên mới tự chọn phong cách phù hợp.\n" +
  "KHUNG HÌNH: ảnh ra theo đúng tỉ lệ ghi ở mục \"Khung hình\" bên dưới (không ghi thì là khung vuông) — ghi rõ tỉ lệ và hướng khung vào prompt (vd. \"horizontal 16:9 frame\", \"vertical 9:16 frame\") và bố cục chủ thể cho vừa khung đó. Nếu chủ thể có hình dạng dài/chéo (vd. búa, kiếm, người nằm, cây gậy...), BẮT BUỘC thêm vào prompt các từ khoá đảm bảo toàn bộ chủ thể nằm gọn trong khung, không bị cắt ở cạnh ảnh — vd. \"the entire object fully visible within frame\", \"nothing cropped at the edges\", \"comfortable padding around the subject\", \"zoomed out enough to fit the whole item\" — và cân nhắc xoay chủ thể theo chiều phù hợp với khung (vd. khung vuông/dọc thì đặt chéo góc hoặc dựng đứng) thay vì chiều ngang dài hết cỡ.\n" +
  "LƯU Ý: model KHÔNG hỗ trợ nền trong suốt thật (không xuất file có alpha channel) — nếu mô tả có yêu cầu \"xoá nền\"/\"nền trong suốt\", đừng hứa hẹn điều đó trong prompt; thay vào đó dùng \"on a plain, solid, uncluttered background, studio product photography\" để dễ tách nền thủ công sau, và không nhắc đến \"transparent background\".\n" +
  "Nếu có kèm (một hoặc nhiều) ảnh mẫu PHONG CÁCH: các ảnh đó CHỈ để tham khảo PHONG CÁCH thị giác (kiểu vẽ/chất liệu, bảng màu, nét cọ/độ chi tiết, ánh sáng, mood) — tuyệt đối không mô tả hay giữ lại chủ thể/nội dung của bất kỳ ảnh mẫu nào. Hãy mô tả phong cách chung rút ra từ các ảnh đó thành từ ngữ cụ thể rồi ghép vào cuối prompt (vd. \"in the style of a soft pastel watercolor illustration with warm backlighting\").\n" +
  "Nếu có kèm ẢNH NHÂN VẬT THẬT (mỗi ảnh gắn với đúng một tên nhân vật, nêu rõ trong mô tả bên dưới theo thứ tự ảnh): đây là ẢNH THẬT của nhân vật đó — NGƯỢC LẠI với ảnh mẫu phong cách, ở đây bạn PHẢI mô tả cụ thể khuôn mặt, kiểu tóc, vóc dáng, trang phục và mọi đặc điểm nhận diện quan sát được trong ảnh, để người/model vẽ ra đúng người này — không tự đặt lại ngoại hình khác với ảnh. Nếu mô tả tài nguyên cũng có ghi ngoại hình, ảnh thật vẫn được ưu tiên hơn khi có mâu thuẫn.\n" +
  "Nếu có \"Phong cách đồ hoạ cố định\": đây là phong cách BẮT BUỘC áp dụng cho TOÀN BỘ video, do người dùng chọn trước — phải tuân theo NGHIÊM NGẶT và đầy đủ (màu sắc, nét vẽ, tỉ lệ, quy tắc nhận diện nhân vật...), không được tóm tắt qua loa hay bỏ bớt chi tiết. Đây không phải mô tả cảnh thông thường — ưu tiên cao hơn mô tả cảnh nếu có xung đột.\n" +
  "LOẠI ẢNH (field `layer`): \"scene\" = MỘT KHUNG HÌNH HOÀN CHỈNH của cảnh — chủ thể nằm trong bối cảnh đầy đủ, phủ kín khung theo Khung hình. \"cutout\" = CHỈ RIÊNG chủ thể (vật phẩm/nhân vật) tách khỏi bối cảnh, để ghép lên khung hình và làm chuyển động khi dựng. Chọn \"cutout\" khi chủ thể có chuyển động hay biến đổi riêng trong cảnh (vd. điện thoại sáng lên/hiện tin nhắn, vật rơi/bay/xoay/bật mở, nhân vật vẫy tay/đi lại/đổi biểu cảm); chủ thể đứng yên thì chọn \"scene\". Đọc cả phần diễn biến trong \"Bối cảnh cảnh quay\": hễ chủ thể chính có BẤT KỲ thay đổi nào trong cảnh (sáng lên, hiện ra, bật lên, rung, mở ra, rơi, di chuyển, đổi nét mặt...) thì PHẢI chọn \"cutout\" — nền của cảnh được tạo thành một ảnh riêng, nên đừng giữ chủ thể trong khung chỉ để có nền; vẽ chủ thể ở trạng thái rõ nhất của cảnh (vd. màn hình đã sáng và đã hiện thông báo). Nếu có mục \"Loại ảnh (người dùng đã chọn)\" thì dùng ĐÚNG loại đó. Với \"cutout\": prompt chỉ mô tả chủ thể đơn lẻ, chiếm gần trọn khung với viền rất mỏng (the subject fills almost the entire canvas with only a thin margin, nothing cropped), isolated on a plain solid uncluttered background — không vẽ bối cảnh, không để khoảng trống thừa quanh chủ thể, và không áp tỉ lệ Khung hình (để khung vừa dáng chủ thể). Nếu mô tả là SPRITE SHEET (hành động của nhân vật HOẶC biến đổi của đồ vật): prompt mô tả MỘT ảnh lưới theo số khung ghi trong mô tả (mặc định 4 cột × 3 hàng = 12 khung; 8 khung = 4×2; 16 khung = 4×4) gồm các khung LIÊN TIẾP của cùng một chủ thể đi từ trạng thái đầu đến trạng thái cuối, cùng tỉ lệ, cùng góc nhìn, cùng kích thước ô, không đánh số, không kẻ viền ô, nền trơn — layer \"cutout\".\n" +
  "SHOT: nếu có mục \"Shot của ảnh này\", ảnh thuộc đúng shot đó trong kế hoạch quay — vẽ theo ĐÚNG cỡ cảnh (cực cận/cận/trung/toàn/viễn) và góc máy (ngang tầm, góc cao, góc thấp, từ trên xuống, qua vai, POV, nghiêng khung) của shot, ghi rõ chúng vào prompt (vd. \"close-up, top-down view\", \"over-the-shoulder shot\"); shot quyết định khung hình chứ không phải mô tả chung của cả cảnh.\n" +
  "VỊ TRÍ & GÓC: nếu có mục \"Vị trí & góc trong cảnh\", prompt PHẢI thể hiện đúng: với cutout/sprite sheet — vẽ chủ thể theo ĐÚNG góc máy và phối cảnh đó (vd. đồ vật nằm trên mặt phẳng nhìn chéo từ trên xuống thì vẽ thu ngắn theo phối cảnh, nghiêng đúng hướng, cạnh gần máy quay to hơn — KHÔNG vẽ thẳng mặt dẹt), đúng tư thế với chỗ nằm/ngồi/đứng, đúng hướng quay, ánh sáng cùng hướng với cảnh, và kèm bóng đổ mềm bán trong suốt ngay chỗ tiếp xúc nếu chủ thể nằm/đứng trên một bề mặt; với nền — giữ đúng góc máy đó và chừa trống đúng các chỗ sẽ ghép. Không có mục này thì tự suy ra góc tự nhiên nhất từ bối cảnh cảnh quay.\n" +
  "TÍNH HỢP LÝ của hành động — kiểm tra từng mô tả như một người quan sát đời thật trước khi chốt: tư thế, hướng nhìn, cách cầm/dùng đồ vật phải đúng như người thật làm. Ví dụ: đang đọc điện thoại thì màn hình QUAY VỀ PHÍA NHÂN VẬT, hơi chúi xuống, ngang tầm ngực–mặt (người xem thấy mặt lưng máy); nhìn camera nói chuyện thì điện thoại hạ xuống/cầm hờ, KHÔNG chĩa màn hình vào ống kính. Khi khán giả cần thấy nội dung màn hình/giấy tờ → dùng cảnh cận (insert) riêng hoặc lớp phủ lúc dựng, KHÔNG bắt nhân vật cầm ngược đồ vật cho khán giả xem — trừ khi kịch bản cố ý cho nhân vật chìa/khoe vật đó (khi ấy ghi rõ động tác \"chìa màn hình về phía người xem\"). Mọi khung của một sprite sheet giữ cùng cách cầm, cùng tay cầm và cùng hướng đồ vật, trừ khi chính hành động là đổi cách cầm. Mô tả nào vô lý thì sửa cho hợp lý. Prompt phải nói rõ hướng của đồ vật và hướng nhìn (vd. \"the phone screen faces him, the viewer sees the back of the phone\").\n" +
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
      model: input.model ?? defaultModelFor(input.provider),
      effort: input.effort ?? "low",
      system: promptOf(ctx, this, "system"),
      text: [
        `Mô tả tài nguyên: ${input.description}`,
        `Khung hình: ${input.frameRatio ? frameRatioForAi(input.frameRatio) : "1:1 (vuông)"}`,
        input.layer
          ? `Loại ảnh (người dùng đã chọn): ${input.layer === "cutout" ? "cutout — chỉ chủ thể, tách nền" : "scene — khung hình hoàn chỉnh"}`
          : null,
        input.shot ? `Shot của ảnh này: ${input.shot}` : null,
        input.placement ? `Vị trí & góc trong cảnh: ${input.placement}` : null,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
        styleImages.length
          ? `Có kèm ${styleImages.length} ảnh mẫu phong cách ở trên — chỉ lấy phong cách, không lấy nội dung.`
          : null,
        characterImages.length
          ? `Có kèm ${characterImages.length} ảnh nhân vật thật, theo đúng thứ tự sau ảnh mẫu phong cách (nếu có), lần lượt là: ${characterImages.map((c) => c.name).join(", ")}.`
          : null,
        input.graphicsStyle ? `Phong cách đồ hoạ cố định (bắt buộc áp dụng cho toàn bộ video): ${input.graphicsStyle}` : null,
        input.styleFromSkill
          ? "Phong cách: do skill đính kèm quyết định — không viết từ ngữ nào về phong cách, chỉ mô tả nội dung."
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      images: images.length ? images : undefined,
      schema: SCHEMA,
      schemaName: "image_prompt",
    });
    return {
      prompt: result?.prompt?.trim() || input.description,
      count: Math.max(1, Math.round(result?.count ?? 1)),
      // The user's choice wins; otherwise the AI's, defaulting to a whole frame.
      layer: input.layer ?? (result?.layer === "cutout" ? "cutout" : "scene"),
    };
  },
});
