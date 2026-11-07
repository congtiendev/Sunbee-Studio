import type { StyleTemplate } from "../../../shared/types.js";

const NARRATIVE_ROLES = [
  "hook",
  "context",
  "buildup",
  "keyPoint",
  "emotionalBeat",
  "proof",
  "transition",
  "callToAction",
  "outro",
] as const;

const SHOT_SIZES = [
  "extremeCloseUp",
  "closeUp",
  "medium",
  "wide",
  "extremeWide",
] as const;

const CAMERA_MOVEMENTS = [
  "static",
  "pan",
  "tilt",
  "zoom",
  "handheld",
  "tracking",
] as const;

const REQUIRED_ASSET_TYPES = ["image", "video", "audio", "graphic"] as const;
const REQUIRED_ASSET_SOURCES = ["generate", "stock", "provided"] as const;

export const SCRIPT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          content: { type: "string" },
          visualDescription: { type: "string" },
          estimatedDurationSec: { type: "integer" },
          narrativeRole: { type: "string", enum: NARRATIVE_ROLES },
          shotSize: { type: "string", enum: SHOT_SIZES },
          cameraMovement: { type: "string", enum: CAMERA_MOVEMENTS },
          heroMoment: { type: "boolean" },
          requiredAssets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: REQUIRED_ASSET_TYPES },
                description: { type: "string" },
                source: { type: "string", enum: REQUIRED_ASSET_SOURCES },
              },
              required: ["type", "description", "source"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "index",
          "content",
          "visualDescription",
          "estimatedDurationSec",
          "narrativeRole",
          "shotSize",
          "cameraMovement",
          "heroMoment",
          "requiredAssets",
        ],
        additionalProperties: false,
      },
    },
    resources: {
      type: "object",
      properties: {
        shotCount: { type: "integer" },
        voiceover: { type: "string" },
        music: { type: "string" },
        images: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["shotCount", "voiceover", "music", "images", "notes"],
      additionalProperties: false,
    },
    style: {
      type: "object",
      properties: {
        genre: { type: "string" },
        styleTags: { type: "array", items: { type: "string" } },
        toneDescription: { type: "string" },
      },
      required: ["genre", "styleTags", "toneDescription"],
      additionalProperties: false,
    },
  },
  required: ["scenes", "resources", "style"],
  additionalProperties: false,
} as const;

function buildStyleHintLine(styleTemplate?: StyleTemplate): string {
  if (!styleTemplate) return "";
  return `\n\nGiữ phong cách theo skill đã lưu "${styleTemplate.name}": thể loại ${styleTemplate.genre}, các từ khoá phong cách ${styleTemplate.styleTags.join(", ")}, tone/giọng điệu: ${styleTemplate.toneDescription}, nhịp độ trung bình ${styleTemplate.pacing.avgShotLengthSec.toFixed(1)}s/cảnh (~${styleTemplate.pacing.cutsPerMinute.toFixed(1)} cắt/phút).`;
}

const FRAMES_HINT =
  "\n\nNgoài kịch bản, bạn còn được cung cấp một số khung hình (ảnh tĩnh) lấy đều theo thời gian từ chính video gốc, theo đúng thứ tự thời gian, ở độ phân giải cao — hãy nhìn kỹ từng khung hình (màu sắc, ánh sáng, nhân vật, chữ/overlay xuất hiện trong ảnh, bối cảnh, chi tiết nền) để viết visualDescription chính xác và cụ thể, thay vì chỉ đoán từ chữ. Đặc biệt chú ý ĐỌC KỸ mọi chữ/số nhỏ xuất hiện trong khung hình (tin nhắn, đồng hồ, mốc thời gian, chỉ số, tên hiển thị...) — khoảng cách thời gian hoặc con số cụ thể giữa các khung hình thường chính là điểm nhấn/điểm hài của video (ví dụ: 2 mốc giờ trong một đoạn chat cách nhau rất ngắn cho thấy nhân vật di chuyển/phản hồi nhanh bất thường), đừng bỏ qua chi tiết này. Khung hình có thể không khớp chính xác từng phân cảnh vì được lấy mẫu đều theo thời gian (không theo điểm cắt cảnh thật). Nếu một khung hình có nội dung/phong cách hình ảnh khác hẳn các khung hình xung quanh (ví dụ chuyển sang một đoạn clip/thể loại khác hẳn), đừng vội kết luận đó là lỗi chèn nhầm — trước tiên hãy xét xem nó có thể là một ẩn dụ/so sánh hài hước có chủ đích hay không (ví dụ: chèn hình ảnh vận động viên tốc độ để ví von một hành động diễn ra rất nhanh trong câu chuyện), dựa trên mạch truyện và các chi tiết thời gian/số liệu đã đọc được. Chỉ ghi nhận là bất thường/không liên quan khi thực sự không tìm ra được mối liên hệ hợp lý nào.";

export function buildSystemPrompt(
  styleTemplate: StyleTemplate | undefined,
  hasFrames: boolean,
): string {
  return (
    "Bạn là trợ lý sản xuất video. Đọc kịch bản người dùng cung cấp, chia thành các phân cảnh hợp lý theo thứ tự. Mỗi cảnh gồm:\n" +
    "- content: nội dung/thoại/hành động diễn ra trong cảnh.\n" +
    "- visualDescription: mô tả hình ảnh CHI TIẾT và SỐNG ĐỘNG, viết như đang kể lại cảnh quay cho một người hoàn toàn chưa xem video và sẽ không được xem ảnh minh hoạ — họ chỉ có đúng đoạn mô tả này để hình dung. Tối thiểu 3-4 câu cụ thể, nêu rõ: bối cảnh/địa điểm, thời điểm trong ngày và kiểu ánh sáng, nhân vật xuất hiện (ngoại hình, trang phục, tư thế, biểu cảm, hành động đang làm), màu sắc chủ đạo, bố cục khung hình, và các chi tiết đáng chú ý trong nền hoặc chữ/overlay nếu có. Tránh câu chung chung kiểu \"một người đang đứng trong phòng\" — hãy cụ thể hoá tối đa những gì thực sự quan sát được (hoặc, nếu không có khung hình tham khảo, những gì hợp lý nhất để hình dung từ kịch bản).\n" +
    "- thời lượng ước tính tính bằng giây, vai trò trong mạch truyện (narrativeRole), cỡ cảnh gợi ý (shotSize), chuyển động máy quay gợi ý (cameraMovement), có phải là cảnh cao trào/đáng chia sẻ nhất không (heroMoment), và danh sách tài nguyên cần cho riêng cảnh đó (requiredAssets: loại, mô tả, nguồn sinh/tìm/đã có).\n" +
    "Ngoài ra liệt kê tài nguyên tổng thể cần chuẩn bị để quay/dựng (số cảnh quay, giọng đọc cần, nhạc nền, hình ảnh/b-roll cần, ghi chú khác), và tóm tắt phong cách tổng thể (thể loại, các từ khoá phong cách, mô tả tone/giọng điệu) để có thể lưu lại dùng cho các video sau. Trả lời bằng cùng ngôn ngữ với kịch bản gốc." +
    buildStyleHintLine(styleTemplate) +
    (hasFrames ? FRAMES_HINT : "")
  );
}
