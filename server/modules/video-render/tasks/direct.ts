import { existsSync } from "node:fs";
import path from "node:path";
import { frameRatioForAi } from "../../../../shared/frame-ratio.js";
import { CLIP_TRANSITIONS, SHOT_KINDS, SHOT_KIND_CARDS } from "../../../../shared/render.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type {
  ClipTransition,
  FrameRatio,
  RenderCaptionStyle,
  RenderScene,
  ShotKind,
} from "../../../../shared/types.js";
import type { AiEffort } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";

/** The vendored video-shotcraft skill (SKILL.md + references/) — uploaded to the user's Anthropic workspace on first use. */
const SKILL_DIR = path.join(process.cwd(), "vendor", "video-shotcraft");

export interface DirectRenderInput {
  scriptText: string;
  frameRatio: FrameRatio;
  targetDurationSec?: number | null;
  model?: string;
  effort?: AiEffort;
}

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là đạo diễn video ngắn kể chuyện bằng ẢNH và CHỮ trên màn hình. Trong container có skill `video-shotcraft` — TRƯỚC khi lên kế hoạch, hãy đọc SKILL.md, references/aesthetic-rules.md, phần storyboard trong references/pipeline.md và các shot card liên quan trong references/shots/, rồi storyboard kịch bản theo đúng phương pháp của skill: đường cong năng lượng thấp → cao, có nhịp hold/nghỉ, chọn shot theo ý nghĩa từng nhịp, dành hiệu ứng mạnh cho khoảnh khắc quan trọng.\n" +
  "- Mở đầu bằng một hook mạnh; kết bằng một nhịp lắng hoặc lời kêu gọi rõ ràng.\n" +
  "- Hiệu ứng mạnh (crashZoom, jumpCut, whipPan, lightLeak) không quá 1/5 số cảnh; phần lớn cảnh có ảnh dùng kenBurns cho nhịp đều.\n" +
  "- `imageHint`: mô tả cụ thể BỨC ẢNH THẬT cần tìm trên web cho cảnh (chủ thể, bối cảnh, loại ảnh: ảnh chụp/bản đồ/sơ đồ...), viết bằng ngôn ngữ dễ tìm nhất.";

/** Fixed by the renderer — not part of the editable prompt, so an edited prompt can't ask for shots Sunbee can't draw. */
const SHOT_DESCRIPTIONS: Record<ShotKind, string> = {
  kenBurns: "ảnh, đẩy/trôi chậm — mặc định cho cảnh có ảnh",
  staticHold: "ảnh đứng yên — khi người xem cần nhìn kỹ chi tiết",
  lowerThirdCaption: "ảnh + phụ đề trồi lên — khi chữ là điểm nhấn trên ảnh",
  titleCard: "thẻ chữ toàn màn (không cần ảnh) — tiêu đề phần, lời kết",
  blurSlideTitle: "tiêu đề kiểu tạp chí, chữ nổi lên từ vùng mờ trên ảnh tối — ý chính, mở phần",
  markerTitle: "tiêu đề trên nền giấy, gạch chân bút dạ dưới `emphasis` (không cần ảnh) — thông điệp then chốt",
  textMask: "chữ khổng lồ (từ `emphasis`) nhìn xuyên ra ảnh rồi lao qua chữ vào ảnh — mở đầu/hook",
  crashZoom: "zoom gấp vào chủ thể giữa ảnh, có bật lại và loé sáng — khoảnh khắc nhấn mạnh",
  jumpCut: "3 nấc cắt nhảy dí sát cùng ảnh — nhịp mạnh, hook, sự thật gây sốc",
  pullBack: "mở sát rồi lùi xa, xung quanh chìm tối — cảm xúc, cô đơn, kết luận",
};

const TRANSITION_DESCRIPTIONS: Record<ClipTransition, string> = {
  cut: "cắt thẳng (mặc định)",
  fade: "mờ dần qua đen — chuyển phần/ý mới, nhịp chậm",
  whipPan: "lia gấp nhoè chuyển động — chuyển ý nhanh, năng lượng cao",
  lightLeak: "loé ánh sáng ấm — chuyển mốc thời gian/cảm xúc",
};

function catalog(): string {
  const cardOf = (key: ShotKind | ClipTransition) => (SHOT_KIND_CARDS[key] ? ` [card: ${SHOT_KIND_CARDS[key]}]` : "");
  return [
    "BẠN KHÔNG DỰNG VIDEO: không viết code Remotion, không cài gì, không render — container không có mạng. Sunbee tự dựng bằng bộ shot cố định dưới đây. Mỗi cảnh chọn đúng một `shotKind` trong danh sách; nếu card của skill bạn muốn dùng không có ở đây, chọn shotKind gần nhất và ghi tên card bạn đã nghĩ tới vào `shotCard`.",
    "shotKind:",
    ...SHOT_KINDS.map((kind) => `- ${kind}${cardOf(kind)}: ${SHOT_DESCRIPTIONS[kind]}`),
    "transitionOut (chuyển sang cảnh sau):",
    ...CLIP_TRANSITIONS.map((t) => `- ${t}${cardOf(t)}: ${TRANSITION_DESCRIPTIONS[t]}`),
    "Quy tắc dữ liệu:",
    "- `text`: ĐÚNG lời kịch bản của cảnh, theo thứ tự, không bỏ sót, không viết thêm (1–2 câu ngắn mỗi cảnh). Ghi chú hình ảnh trong ngoặc vuông [..] không đưa vào text — dùng cho imageHint.",
    "- `durationSec`: đủ để đọc hết chữ — khoảng 3 từ/giây tiếng Việt, tối thiểu 2, tối đa 8 (textMask/crashZoom/jumpCut/pullBack nên ≥ 3).",
    "- `captionStyle`: none | lowerThird | title. `emphasis`: từ/cụm từ khoá có trong text (chuỗi rỗng nếu không có).",
    "- `imageHint`: chuỗi rỗng với titleCard/markerTitle/blurSlideTitle không cần ảnh riêng.",
    'Kết thúc câu trả lời bằng ĐÚNG MỘT khối ```json dạng {"scenes":[{"text":"","durationSec":3,"shotKind":"kenBurns","shotCard":"","captionStyle":"lowerThird","transitionOut":"cut","imageHint":"","emphasis":""}]} — không thêm chữ nào sau khối json.',
  ].join("\n");
}

const CAPTION_STYLES: RenderCaptionStyle[] = ["none", "lowerThird", "title"];

function normalize(raw: unknown): RenderScene[] {
  const list = (raw as { scenes?: unknown })?.scenes;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): RenderScene[] => {
    const s = (item ?? {}) as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!text) return [];
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const shotKind = SHOT_KINDS.includes(s.shotKind as ShotKind) ? (s.shotKind as ShotKind) : "kenBurns";
    return [
      {
        text,
        durationSec: Math.min(30, Math.max(1, Number(s.durationSec) || 3)),
        shotKind,
        captionStyle: CAPTION_STYLES.includes(s.captionStyle as RenderCaptionStyle)
          ? (s.captionStyle as RenderCaptionStyle)
          : "lowerThird",
        transitionOut: CLIP_TRANSITIONS.includes(s.transitionOut as ClipTransition)
          ? (s.transitionOut as ClipTransition)
          : "cut",
        imageHint: str(s.imageHint),
        emphasis: str(s.emphasis) || undefined,
        shotCard: str(s.shotCard) || undefined,
      },
    ];
  });
}

export const directRenderTask = defineTask<DirectRenderInput, RenderScene[]>({
  key: "videoRender.direct",
  module: "videoRender",
  label: { en: "Direct the video (video-shotcraft skill)", vi: "Đạo diễn video (skill video-shotcraft)" },
  description: {
    en: "Video render: Claude reads the video-shotcraft skill (shot cards, aesthetic rules) and storyboards the script into scenes — shot, timing, transition, the picture each needs.",
    vi: "Dựng video: Claude đọc skill video-shotcraft (shot card, quy tắc thẩm mỹ) rồi storyboard kịch bản thành cảnh — shot, thời lượng, chuyển cảnh, ảnh cần cho từng cảnh.",
  },
  prompts: [{ key: "system", label: { en: "Directing style", vi: "Phong cách đạo diễn" }, default: DEFAULT_SYSTEM_PROMPT }],

  async run(input, ctx) {
    if (!existsSync(path.join(SKILL_DIR, "SKILL.md"))) {
      throw new Error("Thiếu skill video-shotcraft (vendor/video-shotcraft) — xem docs/video-render.md.");
    }
    const provider = providerFor(ctx, "claude");
    if (!provider.generateWithSkill) throw new Error("Đạo diễn bằng skill cần Claude.");
    const length = input.targetDurationSec
      ? `Thời lượng mong muốn: khoảng ${input.targetDurationSec} giây.`
      : "Thời lượng: theo độ dài kịch bản.";
    const text = await provider.generateWithSkill({
      model: input.model ?? defaultModelFor("claude"),
      system: `${promptOf(ctx, this, "system")}\n\n${catalog()}`,
      text: `Khung hình: ${frameRatioForAi(input.frameRatio)}. ${length}\n\nKịch bản:\n${input.scriptText.trim()}`,
      effort: input.effort ?? "medium",
      skill: { name: "video-shotcraft", dir: SKILL_DIR },
    });
    const match = /```json\s*([\s\S]*?)```/.exec(text) ?? /(\{[\s\S]*"scenes"[\s\S]*\})/.exec(text);
    let scenes: RenderScene[];
    try {
      scenes = match ? normalize(JSON.parse(match[1]!)) : [];
    } catch {
      scenes = [];
    }
    if (scenes.length === 0) throw new Error("Claude không trả về storyboard hợp lệ — hãy thử lại.");
    return scenes;
  },
});
