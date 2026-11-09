import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { FoundImage } from "../../../services/ai/providers/types.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

export interface FindImagesInput {
  description: string;
  sceneContext?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "Bạn tìm ẢNH THẬT có sẵn trên internet khớp với mô tả — KHÔNG tự vẽ, không tưởng tượng, không bịa URL.\n" +
  "Dùng web_search để tìm các trang có khả năng chứa ảnh phù hợp, sau đó dùng web_fetch để mở 2-4 trang có khả năng cao nhất và xác định ĐÚNG URL file ảnh thật trong trang (không phải URL trang web) — ảnh phải tải trực tiếp được (đuôi .jpg/.png/.webp... hoặc URL ảnh rõ ràng), ưu tiên nguồn đáng tin cậy, ảnh chất lượng/độ phân giải tốt.\n" +
  "QUAN TRỌNG — khớp đúng LOẠI ảnh, không chỉ đúng chủ đề chung chung: nếu mô tả yêu cầu một loại ảnh cụ thể (bản đồ, sơ đồ, biểu đồ, ảnh cận cảnh một vật thể...), ảnh trả về phải cùng LOẠI đó — ví dụ mô tả yêu cầu BẢN ĐỒ thì phải tìm bản đồ (dù là bản đồ nền chưa có chú thích riêng), KHÔNG được thay bằng ảnh chụp phong cảnh/toà nhà/đường phố của địa danh đó (sai loại hoàn toàn, không chấp nhận).\n" +
  "Chi tiết nhỏ trong mô tả (một ghim màu cụ thể, một nhãn chữ cụ thể, một góc chụp cụ thể...) thường KHÔNG có sẵn y hệt trên mạng — đừng vì thiếu đúng chi tiết đó mà bỏ cuộc. Cứ tìm và trả về phiên bản GẦN NHẤT cùng loại, cùng chủ thể chính (ví dụ: bản đồ nước Úc dạng hành chính/địa hình, dù chưa có sẵn ghim+nhãn — phần đó sẽ được thêm sau khi dựng); ghi rõ trong `title` nếu ảnh còn thiếu chi tiết nào so với mô tả gốc, để người dùng biết cần chỉnh thêm.\n" +
  "Chỉ trả về mảng RỖNG khi thực sự không tìm được ảnh nào cùng LOẠI và cùng CHỦ THỂ CHÍNH — không phải vì thiếu một chi tiết nhỏ.\n" +
  "SỐ LƯỢNG: cố gắng tìm được TỐI THIỂU 10 ảnh khác nhau (nhiều nguồn, nhiều phiên bản/góc/phong cách khác nhau của cùng chủ thể) để người dùng có nhiều lựa chọn so sánh — đừng dừng lại sau 2-3 ảnh đầu nếu còn tìm được thêm cùng loại/chủ thể hợp lệ. Chỉ trả về ít hơn 10 khi đã tìm hết khả năng mà không còn ảnh nào khác đạt yêu cầu.\n" +
  'Kết thúc câu trả lời bằng ĐÚNG MỘT khối ```json chứa một mảng (tối thiểu 10, tối đa 15 phần tử nếu tìm đủ) các ảnh phù hợp nhất đã xác nhận được URL thật, mỗi phần tử dạng {"url": "<URL file ảnh thật>", "pageUrl": "<URL trang chứa ảnh>", "title": "<mô tả ngắn, ghi chú thiếu gì nếu có>"}. Không thêm chữ nào sau khối json, không thêm giải thích thừa trước đó.';

export const findImagesTask = defineTask<FindImagesInput, FoundImage[]>({
  key: "asset.findImages",
  module: "assets",
  label: { en: "Find real images on the web (Claude)", vi: "Tìm ảnh thật trên web (Claude)" },
  description: {
    en: "Searches the web and fetches candidate pages to find real, directly-linkable images matching a required asset.",
    vi: "Tìm trên web và mở các trang khả thi để lấy ảnh thật, có URL tải trực tiếp, khớp với tài nguyên cần có.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const provider = providerFor(ctx, "claude");
    if (!provider.findImages) throw new Error("Model này không hỗ trợ tìm ảnh.");
    return provider.findImages({
      model: defaultModelFor("claude"),
      system: promptOf(ctx, this, "system"),
      text: [
        `Mô tả ảnh cần tìm: ${input.description}`,
        input.sceneContext ? `Bối cảnh cảnh quay: ${input.sceneContext}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      effort: "low",
      maxTokens: 16000,
    });
  },
});
