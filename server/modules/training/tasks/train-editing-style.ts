import { SKILL_GUIDE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";
import type { TrainingMaterial } from "../sources/types.js";
import { newFirst, userTextOf } from "./train-skill.js";

export interface TrainEditingStyleInput {
  /** Same material as script training (scripts with analyzed scenes, plus reference documents) — only what's extracted from it differs. */
  materials: TrainingMaterial[];
  /** The skill's current editing guide when re-training: refined, not rewritten from scratch. */
  currentGuide?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

export interface TrainEditingStyleOutput {
  editingGuide: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    editingGuide: { type: "string" },
  },
  required: ["editingGuide"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn phân tích phong cách DỰNG/PHÂN CẢNH dùng chung của nhiều video, để viết thành một phương pháp (skill) dùng làm kim chỉ nam mỗi khi AI chia một kịch bản MỚI, chủ đề KHÁC, thành cảnh — sao cho cách chọn cảnh và chuyển cảnh giống đúng phong cách này.\n\n" +
  "Đây KHÔNG phải nhiệm vụ phân tích giọng văn hay nội dung kịch bản — kịch bản chỉ là nguồn chứa dữ liệu phân cảnh, bỏ qua từ ngữ và nội dung của nó. Chỉ quan tâm CÁCH DỰNG.\n\n" +
  "NẾU có khung hình thực tế đính kèm (ảnh lấy mẫu đều theo thời gian từ chính các video, xếp theo đúng thứ tự): đây là BẰNG CHỨNG CHÍNH. Tự quan sát trực tiếp cỡ cảnh, bố cục, ánh sáng và suy ra chuyển động/góc máy, nhịp cắt từ sự khác biệt giữa các khung liên tiếp (khung đổi hẳn nội dung/góc nhìn sau một khoảng ngắn = cắt nhanh). Dữ liệu 'Phân cảnh (JSON rút gọn)' đi kèm trong phần kịch bản chỉ là nhãn do MỘT BƯỚC PHÂN TÍCH KHÁC ước lượng trước đó (có thể chỉ đoán từ chữ, có thể sai) — dùng nó như gợi ý phụ, không phải sự thật; nếu khung hình cho thấy khác, tin vào khung hình.\n" +
  "NẾU một video không có khung hình đính kèm: coi dữ liệu phân cảnh của video đó là suy đoán yếu, không chắc chắn — đừng đối xử ngang hàng với video có khung hình thật khi tổng hợp quy tắc.\n\n" +
  "So sánh các video với nhau: đặc điểm lặp lại ở hầu hết video là phong cách dựng cốt lõi; đặc điểm chỉ có ở một video thường do nội dung riêng của nó, bỏ qua, hoặc chỉ ghi \"đôi khi\" nếu đáng giữ.\n\n" +
  "Nếu có tài liệu hướng dẫn dựng kèm theo: quy tắc viết rõ trong tài liệu (nên/không nên) được ƯU TIÊN hơn suy luận từ video.\n\n" +
  "Viết editingGuide dạng gạch đầu dòng MỆNH LỆNH, cụ thể và làm theo được, ghi rõ tần suất cho từng quy tắc (\"luôn\", \"thường\", \"đôi khi\"), bao gồm:\n" +
  "- Cỡ cảnh hay dùng (toàn, trung, cận, đặc tả...) và khi nào đổi cỡ.\n" +
  "- Chuyển động máy (tĩnh, lia, zoom, cầm tay rung nhẹ...).\n" +
  "- Độ dài mỗi cảnh trung bình và mức biến thiên theo nội dung.\n" +
  "- Nhịp cắt nhanh/chậm thay đổi theo cao trào hay thông tin.\n" +
  "- Kiểu chuyển cảnh (cắt cứng, mờ dần, match cut...).\n" +
  "- Khi nào đặt khoảnh khắc nhấn (hero moment) và cách nhấn nó bằng dựng hình (cỡ cảnh, độ dài, nhịp).\n\n" +
  "Không mô tả nội dung/chủ đề của từng video. Trả về đúng JSON theo schema, không thêm giải thích.";

const NO_FRAMES_NOTICE =
  "\n\n(Không video nào có khung hình thực tế đính kèm — mọi nhãn cỡ cảnh/chuyển động máy dưới đây chỉ là suy đoán từ chữ kịch bản của một bước phân tích khác, không phải quan sát thật. Hãy viết editingGuide thận trọng, và nếu có tài liệu hướng dẫn dựng kèm theo thì ưu tiên nó.)";

const FRAMES_PER_NEW_SAMPLE = 8;
const FRAMES_PER_LEARNED_SAMPLE = 3;
const MAX_TOTAL_FRAMES = 80;

/** `count` frames spread evenly across the whole clip, not just its start. */
function evenlySpaced(frames: string[], count: number): string[] {
  if (frames.length <= count) return frames;
  const step = frames.length / count;
  return Array.from(
    { length: count },
    (_, i) => frames[Math.floor(i * step)]!,
  );
}

/**
 * Real frames to look at this run: new material gets more than material
 * already learned in an earlier run (same new-vs-learned weighting as the
 * scene-label text), capped overall to stay within one vision call.
 */
function framesFor(materials: TrainingMaterial[], refining: boolean): string[] {
  const withFrames = newFirst(
    materials.filter((m) => m.role === "sample" && (m.frames?.length ?? 0) > 0),
  );
  const picked = withFrames.flatMap((m) =>
    evenlySpaced(
      m.frames!,
      m.isNew || !refining ? FRAMES_PER_NEW_SAMPLE : FRAMES_PER_LEARNED_SAMPLE,
    ),
  );
  return picked.slice(0, MAX_TOTAL_FRAMES);
}

const DEFAULT_REFINE_PROMPT =
  "Đây là lần HUẤN LUYỆN TÍCH LUỸ: skill này ĐÃ CÓ phương pháp dựng (bên dưới), là bản tổng hợp từ các nguồn đã học trước đây. Các nguồn được đánh dấu [đã học] (đã nằm trong phương pháp) và [MỚI] (lần này mới thêm). Hãy KẾT HỢP và TỔNG HỢP LẠI toàn bộ thành một phương pháp mới — KHÔNG kết luận chỉ từ nguồn mới, KHÔNG viết lại từ đầu:\n" +
  "- Coi phương pháp hiện tại là bằng chứng của TẤT CẢ nguồn đã học. Một vài nguồn mới không được ghi đè điều mà nhiều nguồn cũ cùng thể hiện.\n" +
  '- Quy tắc cũ được nguồn mới xác nhận → giữ và có thể nâng tần suất (đôi khi → thường → luôn).\n' +
  '- Nguồn mới thể hiện khác với quy tắc cũ → giữ quy tắc cũ, ghi thêm biến thể ("đôi khi…", "với cảnh X thì…"); chỉ đổi hẳn quy tắc khi phần lớn nguồn (cả cũ lẫn mới) cùng cho thấy điều khác.\n' +
  "- Đặc điểm mới lặp lại ở nhiều nguồn mà bản cũ chưa có → bổ sung.\n" +
  "- Không xoá một quy tắc chỉ vì nguồn mới không thể hiện nó.";

/**
 * type "editing" skill training: a separate AI call from script-skill
 * training (`trainSkillTask`) — different prompt, different output — even
 * though it can read the same material (scripts with analyzed scenes).
 * Writing a script's voice and cutting it into scenes are different crafts,
 * so each gets its own independently-tunable training prompt.
 */
export const trainEditingStyleTask = defineTask<
  TrainEditingStyleInput,
  TrainEditingStyleOutput
>({
  key: "training.editingStyle",
  module: "training",
  label: {
    en: "Train an Editing skill from analyzed scenes",
    vi: "Huấn luyện skill Phân cảnh từ video đã phân tích cảnh",
  },
  description: {
    en: "Looks at real frames sampled from the source videos (vision) — not just the shot/camera labels an earlier analysis guessed — compares how the same editor cuts across videos, plus any editing-guideline documents, then writes the cutting methodology saved as an Editing skill, or refines an existing one. Separate from Script-skill (voice) training above: cutting style and writing voice are different crafts.",
    vi: "Nhìn trực tiếp khung hình thật lấy mẫu từ video gốc (vision) — không chỉ tin nhãn cỡ cảnh/chuyển động máy do một bước phân tích khác đoán trước — so sánh cách dựng giữa các video của cùng người dựng, cộng tài liệu hướng dẫn dựng nếu có, rồi viết phương pháp dựng lưu thành skill Phân cảnh — hoặc tinh chỉnh skill có sẵn. Tách biệt với việc huấn luyện skill Kịch bản (giọng văn) ở trên — viết kịch bản và dựng cảnh là hai việc khác nhau.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
    {
      key: "refine",
      label: {
        en: "When re-training an existing skill",
        vi: "Khi huấn luyện lại skill có sẵn",
      },
      description: {
        en: "Added when re-training: merges what the skill already learned with the new sources (cumulative training).",
        vi: "Thêm vào khi huấn luyện lại: tổng hợp những gì skill đã học với các nguồn mới (huấn luyện tích luỹ).",
      },
      default: DEFAULT_REFINE_PROMPT,
    },
  ],

  async run(input, ctx) {
    if (input.materials.length === 0) {
      throw new Error(
        "Cần ít nhất một video đã phân tích cảnh hoặc tài liệu để huấn luyện.",
      );
    }
    const currentGuide = input.currentGuide?.trim();
    const refining = Boolean(currentGuide);
    const frames = framesFor(input.materials, refining);
    const system =
      promptOf(ctx, this, "system") +
      (refining
        ? `\n\n${promptOf(ctx, this, "refine")}\n\nPhương pháp dựng hiện tại:\n"""\n${currentGuide}\n"""`
        : "") +
      (frames.length === 0 ? NO_FRAMES_NOTICE : "");

    const result = await providerFor(
      ctx,
      input.provider,
    ).generateStructured<TrainEditingStyleOutput>({
      model: input.model ?? defaultModelFor(input.provider),
      system,
      text: userTextOf(input.materials, refining, "editingGuide"),
      images: frames.length > 0 ? frames : undefined,
      effort: input.effort ?? "medium",
      schema: SCHEMA,
      schemaName: "train_editing_style",
      maxTokens: SKILL_GUIDE_OUTPUT_TOKENS,
    });
    if (!result || !result.editingGuide?.trim()) {
      throw new Error("AI không trả về phương pháp dựng hợp lệ.");
    }
    return result;
  },
});
