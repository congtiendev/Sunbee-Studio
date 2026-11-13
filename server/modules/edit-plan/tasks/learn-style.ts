import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { RevealAnimation } from "../../../../shared/edit-recipe.js";
import { SKILL_GUIDE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";
import type { StyleSheet } from "../learn/frames.js";
import type { VideoMeasurements } from "../learn/measure.js";

export interface LearnStyleInput {
  sheets: StyleSheet[];
  measurements: VideoMeasurements;
  /** The sample's title/URL, for the report only. */
  source: string;
  /** The skill's current guide when re-learning: refined, not rewritten. */
  currentGuide?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface LearnStyleOutput {
  /** A few sentences for the user: what this editing style is. */
  summary: string;
  /** Imperative guide for the AI's scene/shot breakdown (the skill's editingStyle). */
  editingGuide: string;
  cameraMotion: "none" | "fromShots";
  revealAnimation: RevealAnimation;
  revealDurationMs: number;
  revealLeadMs: number;
  textAnimation: RevealAnimation;
  textDurationMs: number;
  /** The sample shows burned-in subtitles of the narration. */
  burnedSubtitles: boolean;
  /** Effects seen besides the reveals (montage, spin, shake…), one short line each. */
  effects: string[];
}

const ANIMATION = { type: "string", enum: ["none", "pop", "fade"] } as const;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    editingGuide: { type: "string" },
    cameraMotion: { type: "string", enum: ["none", "fromShots"] },
    revealAnimation: ANIMATION,
    revealDurationMs: { type: "integer" },
    revealLeadMs: { type: "integer" },
    textAnimation: ANIMATION,
    textDurationMs: { type: "integer" },
    burnedSubtitles: { type: "boolean" },
    effects: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "editingGuide",
    "cameraMotion",
    "revealAnimation",
    "revealDurationMs",
    "revealLeadMs",
    "textAnimation",
    "textDurationMs",
    "burnedSubtitles",
    "effects",
  ],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là biên tập viên dựng phim phân tích PHONG CÁCH DỰNG của một video mẫu, để một hệ thống dựng tự động làm ra video MỚI (chủ đề khác) có cùng cảm giác dựng. Bạn được cho: các SỐ ĐO bằng máy (chính xác, tin tuyệt đối) và vài TẤM GHÉP KHUNG HÌNH (mỗi tấm có chú thích nói nó cho thấy gì).\n" +
  "Chỉ quan tâm CÁCH DỰNG, không quan tâm nội dung: máy quay đứng yên hay di chuyển (so các khung trong cùng một shot: khung hình dịch/phóng to dần = có chuyển động máy; chỉ có phần tử mới xuất hiện còn mọi thứ đứng yên = máy tĩnh); mỗi shot được dựng ra sao (cả bố cục có sẵn từ đầu, hay các phần tử xuất hiện dần); phần tử mới vào khung bằng hiệu ứng gì (bật ra từ nhỏ phóng to = pop, hiện mờ dần = fade, xuất hiện ngay = none) và mất bao nhiêu khung (30 khung = 1 giây); chữ/tiêu đề hiện ra thế nào; chuyển shot là cắt thẳng hay có chuyển cảnh; có phụ đề lời thoại in trên hình không (chữ trên hình là tiêu đề/nhãn thì KHÔNG tính là phụ đề); các hiệu ứng đặc biệt khác (montage nhanh, xoay, rung, flash...).\n" +
  "Số đo dùng như sau: số lần 'hiện thêm' mỗi phút cao (≥ 4) nghĩa là shot được dựng dần; tỉ lệ điểm cắt rơi vào quãng nghỉ của giọng cao hơn hẳn mức ngẫu nhiên nghĩa là chỉ cắt giữa câu; có nhạc nền chạy dưới giọng và mức chênh của nó so với giọng.\n" +
  "editingGuide: viết bằng tiếng Việt, gạch đầu dòng MỆNH LỆNH làm theo được, có tần suất (luôn/thường/đôi khi), dùng cho AI khi chia kịch bản mới thành cảnh, shot và tài nguyên hình: máy quay; độ dài shot và nhịp (dùng đúng số đo); cách dựng một shot (bố cục, cái gì xuất hiện dần, thứ tự); hiệu ứng xuất hiện; chữ trên hình; chuyển cảnh; khi nào cắt; âm thanh (nhạc nền, hiệu ứng âm). Không mô tả nội dung video mẫu.\n" +
  "summary: 2–4 câu tiếng Việt tóm tắt phong cách cho người dùng đọc. revealLeadMs: khoảng cách từ điểm cắt tới lúc phần tử đầu tiên bật ra (ms). Trả về đúng JSON theo schema.";

function describeMeasurements(m: VideoMeasurements): string {
  return [
    `Thời lượng: ${m.durationSec} giây; ${m.shots} shot (điểm cắt cứng).`,
    `Độ dài shot: trung bình ${m.shotSec.mean}s, trung vị ${m.shotSec.median}s, 10% ngắn nhất < ${m.shotSec.p10}s, 10% dài nhất > ${m.shotSec.p90}s; ${m.cutsPerMinute} lần cắt/phút.`,
    `Hiện thêm phần tử giữa các lần cắt: ${m.revealsPerMinute} lần/phút; 10% shot có từ ${m.revealsPerShotP90} lần hiện thêm trở lên.`,
    `Điểm cắt rơi vào quãng nghỉ của giọng: ${m.cutInPausePct}% (mức ngẫu nhiên: ${m.pauseBaselinePct}%).`,
    `Âm lượng: giọng khoảng ${m.speechDb} dBFS, nền dưới các quãng nghỉ ${m.floorDb} dBFS; ${m.musicLikely ? "nền là âm có cao độ (nhạc nền chạy suốt)" : "nền không phải nhạc (im lặng/tạp âm)"}.`,
  ].join("\n");
}

export const learnStyleTask = defineTask<LearnStyleInput, LearnStyleOutput>({
  key: "editPlan.learnStyle",
  module: "editPlan",
  label: {
    en: "Learn an editing style from a sample video",
    vi: "Học phong cách dựng từ video mẫu",
  },
  description: {
    en: "Reads a sample video's measured pacing and contact sheets of its frames, and writes an editing skill: a guide for the scene breakdown and the recipe the edit plan builds with.",
    vi: "Đọc số đo nhịp dựng và các tấm ghép khung hình của video mẫu, rồi viết skill dựng: hướng dẫn cho bước chia cảnh và công thức cho bước dựng.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const text = [
      `Video mẫu: ${input.source}`,
      `SỐ ĐO:\n${describeMeasurements(input.measurements)}`,
      input.currentGuide?.trim()
        ? `Hướng dẫn dựng hiện có của skill (tinh chỉnh dựa trên video mẫu này, không viết lại từ đầu):\n${input.currentGuide.trim()}`
        : null,
      `CÁC TẤM GHÉP KHUNG HÌNH (theo thứ tự ảnh đính kèm):\n${input.sheets.map((s, i) => `Ảnh ${i + 1}: ${s.caption}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await providerFor(ctx, input.provider).generateStructured<LearnStyleOutput>({
      maxTokens: SKILL_GUIDE_OUTPUT_TOKENS,
      model: input.model ?? defaultModelFor(input.provider),
      effort: input.effort ?? "medium",
      system: promptOf(ctx, this, "system"),
      text,
      images: input.sheets.map((s) => s.dataUrl),
      schema: SCHEMA,
      schemaName: "editing_style",
    });
    if (!result) throw new Error("AI không trả về phân tích phong cách dựng.");
    return result;
  },
});
