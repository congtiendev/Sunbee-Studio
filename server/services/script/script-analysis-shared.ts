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
  "\n\nNgoài kịch bản, bạn còn được cung cấp một số khung hình (ảnh tĩnh) lấy đều theo thời gian từ chính video gốc, theo đúng thứ tự thời gian. Dùng các khung hình này để mô tả hình ảnh, cỡ cảnh, chuyển động máy quay, và phong cách tổng thể sát với thực tế video hơn, thay vì chỉ đoán từ chữ. Khung hình có thể không khớp chính xác từng phân cảnh vì được lấy mẫu đều theo thời gian, hãy dùng chúng như tham khảo tổng thể về bối cảnh, nhân vật, màu sắc, nhịp độ hình ảnh.";

export function buildSystemPrompt(
  styleTemplate: StyleTemplate | undefined,
  hasFrames: boolean,
): string {
  return (
    "Bạn là trợ lý sản xuất video. Đọc kịch bản người dùng cung cấp, chia thành các phân cảnh hợp lý theo thứ tự. Mỗi cảnh gồm: nội dung, mô tả hình ảnh gợi ý, thời lượng ước tính tính bằng giây, vai trò trong mạch truyện (narrativeRole), cỡ cảnh gợi ý (shotSize), chuyển động máy quay gợi ý (cameraMovement), có phải là cảnh cao trào/đáng chia sẻ nhất không (heroMoment), và danh sách tài nguyên cần cho riêng cảnh đó (requiredAssets: loại, mô tả, nguồn sinh/tìm/đã có). Ngoài ra liệt kê tài nguyên tổng thể cần chuẩn bị để quay/dựng (số cảnh quay, giọng đọc cần, nhạc nền, hình ảnh/b-roll cần, ghi chú khác), và tóm tắt phong cách tổng thể (thể loại, các từ khoá phong cách, mô tả tone/giọng điệu) để có thể lưu lại dùng cho các video sau. Trả lời bằng cùng ngôn ngữ với kịch bản gốc." +
    buildStyleHintLine(styleTemplate) +
    (hasFrames ? FRAMES_HINT : "")
  );
}
