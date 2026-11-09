import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";

export type ScriptLanguage = "vi" | "en";

const LANGUAGE_INSTRUCTION: Record<ScriptLanguage, string> = {
  vi: "Trả lời bằng tiếng Việt, chỉ trả về đoạn kịch bản, không thêm lời dẫn/giải thích.",
  en: "Respond in English, return only the script itself, with no preamble or explanation.",
};

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là trợ lý sản xuất video. Video được cung cấp không có lời thoại rõ ràng trong audio (có thể chỉ có nhạc nền, hiệu ứng âm thanh, hoặc là video câm/meme chỉ có chữ overlay). Bạn được cung cấp một số khung hình (ảnh tĩnh) lấy đều theo thời gian từ chính video, đúng thứ tự thời gian. Hãy xem KỸ TỪNG khung hình một, theo đúng thứ tự, rồi viết lại thành kịch bản text.\n\n" +
  'Yêu cầu bắt buộc về độ chi tiết: KHÔNG được gộp nhiều khung hình liên tiếp vào chung 1-2 câu tóm tắt ngắn. Mỗi khung hình (hoặc mỗi nhóm khung hình thực sự giống hệt nhau, không có gì mới) cần ít nhất một đoạn/câu riêng mô tả cụ thể những gì đang thấy trong chính khung hình đó: vị trí/tư thế chính xác của từng nhân vật, hướng nhìn, biểu cảm khuôn mặt chi tiết (không viết chung chung như "buồn"/"vui" mà mô tả cụ thể như "cau mày, mím môi, ánh mắt cụp xuống"), trang phục và màu sắc gọi đúng tên (không chỉ "màu xanh" mà "xanh dương đậm", "xanh lá nhạt"...), ánh sáng và bóng đổ, chất liệu/kết cấu bề mặt nếu thấy rõ, và mọi chữ/overlay/UI xuất hiện (chép nguyên văn nếu đọc được). So sánh với khung hình ngay trước đó để nêu rõ điều gì đã thay đổi (vị trí, hành động, biểu cảm, bối cảnh).\n\n' +
  "Đặc biệt chú ý ĐỌC KỸ mọi chữ/số nhỏ xuất hiện trong khung hình (tin nhắn, đồng hồ, mốc thời gian, chỉ số, tên hiển thị...) — khoảng cách thời gian hoặc con số cụ thể giữa các khung hình thường chính là điểm nhấn/điểm hài của video (ví dụ: 2 mốc giờ trong một đoạn chat cách nhau rất ngắn cho thấy nhân vật di chuyển/phản hồi nhanh bất thường), hãy nêu rõ các mốc này trong kịch bản.\n\n" +
  "Khung hình được lấy mẫu đều theo thời gian nên có thể không bắt trọn mọi điểm cắt cảnh. Nếu một khung hình có nội dung/phong cách hình ảnh khác hẳn các khung hình xung quanh, đừng vội kết luận đó là lỗi chèn nhầm — trước tiên hãy xét xem nó có thể là một ẩn dụ/so sánh hài hước có chủ đích hay không (ví dụ: chèn hình ảnh vận động viên tốc độ để ví von một hành động diễn ra rất nhanh trong câu chuyện), dựa trên mạch truyện và các chi tiết thời gian/số liệu đã đọc được ở các khung hình trước đó. Chỉ mô tả là bất thường/không rõ liên quan khi thực sự không tìm ra được mối liên hệ hợp lý nào.";

export interface DescribeFramesInput {
  frames: string[];
  provider: ProviderKey;
  model?: string;
  language: ScriptLanguage;
}

export const describeFramesTask = defineTask<DescribeFramesInput, string>({
  key: "script.describeFrames",
  module: "script",
  group: "upload",
  label: {
    en: "Write a script from frames (silent videos)",
    vi: "Viết kịch bản từ khung hình (video không lời)",
  },
  description: {
    en: "When an uploaded video has no real speech, describes what happens in the sampled frames as a stand-in script.",
    vi: "Khi video tải lên không có lời thoại thật, mô tả lại diễn biến trong các khung hình để làm kịch bản thay thế.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      description: {
        en: "The output-language instruction is appended automatically.",
        vi: "Câu yêu cầu ngôn ngữ trả lời được tự thêm vào cuối.",
      },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const isClaude = input.provider === "claude";
    return providerFor(ctx, input.provider).generateText({
      model: input.model ?? defaultModelFor(input.provider),
      system: `${promptOf(ctx, this, "system")}\n\n${LANGUAGE_INSTRUCTION[input.language]}`,
      text: isClaude
        ? "Viết kịch bản mô tả video dựa trên các khung hình trên."
        : "Viết kịch bản mô tả video dựa trên các khung hình sau.",
      images: input.frames,
      imagesFirst: isClaude,
    });
  },
});
