import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_SONNET_MODEL } from "../../../shared/script-cost-estimate.js";

const FRAME_DATA_URL_PREFIX = /^data:image\/jpeg;base64,/;

export type ScriptLanguage = "vi" | "en";

const LANGUAGE_INSTRUCTION: Record<ScriptLanguage, string> = {
  vi: "Trả lời bằng tiếng Việt, chỉ trả về đoạn kịch bản, không thêm lời dẫn/giải thích.",
  en: "Respond in English, return only the script itself, with no preamble or explanation.",
};

export function buildDescribeVideoSystemPrompt(language: ScriptLanguage): string {
  return (
    "Bạn là trợ lý sản xuất video. Video được cung cấp không có lời thoại rõ ràng trong audio (có thể chỉ có nhạc nền, hiệu ứng âm thanh, hoặc là video câm/meme chỉ có chữ overlay). Bạn được cung cấp một số khung hình (ảnh tĩnh) lấy đều theo thời gian từ chính video, đúng thứ tự thời gian. Hãy xem KỸ TỪNG khung hình một, theo đúng thứ tự, rồi viết lại thành kịch bản text.\n\n" +
    "Yêu cầu bắt buộc về độ chi tiết: KHÔNG được gộp nhiều khung hình liên tiếp vào chung 1-2 câu tóm tắt ngắn. Mỗi khung hình (hoặc mỗi nhóm khung hình thực sự giống hệt nhau, không có gì mới) cần ít nhất một đoạn/câu riêng mô tả cụ thể những gì đang thấy trong chính khung hình đó: vị trí/tư thế chính xác của từng nhân vật, hướng nhìn, biểu cảm khuôn mặt chi tiết (không viết chung chung như \"buồn\"/\"vui\" mà mô tả cụ thể như \"cau mày, mím môi, ánh mắt cụp xuống\"), trang phục và màu sắc gọi đúng tên (không chỉ \"màu xanh\" mà \"xanh dương đậm\", \"xanh lá nhạt\"...), ánh sáng và bóng đổ, chất liệu/kết cấu bề mặt nếu thấy rõ, và mọi chữ/overlay/UI xuất hiện (chép nguyên văn nếu đọc được). So sánh với khung hình ngay trước đó để nêu rõ điều gì đã thay đổi (vị trí, hành động, biểu cảm, bối cảnh).\n\n" +
    "Đặc biệt chú ý ĐỌC KỸ mọi chữ/số nhỏ xuất hiện trong khung hình (tin nhắn, đồng hồ, mốc thời gian, chỉ số, tên hiển thị...) — khoảng cách thời gian hoặc con số cụ thể giữa các khung hình thường chính là điểm nhấn/điểm hài của video (ví dụ: 2 mốc giờ trong một đoạn chat cách nhau rất ngắn cho thấy nhân vật di chuyển/phản hồi nhanh bất thường), hãy nêu rõ các mốc này trong kịch bản.\n\n" +
    "Khung hình được lấy mẫu đều theo thời gian nên có thể không bắt trọn mọi điểm cắt cảnh. Nếu một khung hình có nội dung/phong cách hình ảnh khác hẳn các khung hình xung quanh, đừng vội kết luận đó là lỗi chèn nhầm — trước tiên hãy xét xem nó có thể là một ẩn dụ/so sánh hài hước có chủ đích hay không (ví dụ: chèn hình ảnh vận động viên tốc độ để ví von một hành động diễn ra rất nhanh trong câu chuyện), dựa trên mạch truyện và các chi tiết thời gian/số liệu đã đọc được ở các khung hình trước đó. Chỉ mô tả là bất thường/không rõ liên quan khi thực sự không tìm ra được mối liên hệ hợp lý nào.\n\n" +
    LANGUAGE_INSTRUCTION[language]
  );
}

export async function describeVideoFromFrames(
  frames: string[],
  apiKey: string,
  model: string = CLAUDE_SONNET_MODEL,
  language: ScriptLanguage = "vi",
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const content: Anthropic.ContentBlockParam[] = [
    ...frames.map(
      (frame): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frame.replace(FRAME_DATA_URL_PREFIX, ""),
        },
      }),
    ),
    { type: "text", text: "Viết kịch bản mô tả video dựa trên các khung hình trên." },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: buildDescribeVideoSystemPrompt(language),
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text.trim() ?? "";
}
