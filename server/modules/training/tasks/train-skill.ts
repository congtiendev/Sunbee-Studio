import { SKILL_GUIDE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ScriptScene } from "../../../../shared/types.js";
import type {
  AiEffort,
  ProviderKey,
} from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";
import { BUDGET, sharesOf } from "../budget.js";
import type { TrainingMaterial } from "../sources/types.js";

export interface TrainSkillInput {
  /**
   * What to learn from. "sample" material (the author's scripts) is compared to find
   * what's constant; "reference" material (guides, knowledge) is followed and summarized.
   */
  materials: TrainingMaterial[];
  /** The skill's current instructions when re-training: refined, not rewritten from scratch. */
  currentGuide?: string;
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

/** What the model returns; the training service assembles the skill's instructions from it. */
export interface TrainSkillOutput {
  name: string;
  description: string;
  genre: string;
  styleTags: string[];
  toneDescription: string;
  voiceGuide: string;
  styleGuide: string;
  visualGuide: string;
  knowledgeGuide: string;
  sampleLines: string[];
}

const TRAIN_SKILL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    genre: { type: "string" },
    styleTags: { type: "array", items: { type: "string" } },
    toneDescription: { type: "string" },
    voiceGuide: { type: "string" },
    styleGuide: { type: "string" },
    visualGuide: { type: "string" },
    knowledgeGuide: { type: "string" },
    sampleLines: { type: "array", items: { type: "string" } },
  },
  required: [
    "name",
    "description",
    "genre",
    "styleTags",
    "toneDescription",
    "voiceGuide",
    "styleGuide",
    "visualGuide",
    "knowledgeGuide",
    "sampleLines",
  ],
  additionalProperties: false,
} as const;

const SCENES_PER_SCRIPT = 25;
const SCENES_PER_LEARNED_SCRIPT = 10;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là biên tập viên kịch bản video. Bạn nhận các KỊCH BẢN của cùng một tác giả/kênh và/hoặc các TÀI LIỆU tham khảo. Nhiệm vụ: chắt lọc GIỌNG VĂN, PHONG CÁCH và KIẾN THỨC cần thiết thành một bộ hướng dẫn (skill) hoàn chỉnh, để một AI khác viết kịch bản MỚI, chủ đề KHÁC, mà nghe như cùng một tác giả.\n\n" +
  "Với nhiều kịch bản: so sánh chúng với nhau.\n" +
  "- Đặc điểm lặp lại ở hầu hết kịch bản = giọng văn cốt lõi → mô tả thật cụ thể.\n" +
  '- Đặc điểm chỉ có ở một kịch bản thường do chủ đề của nó → bỏ qua, hoặc chỉ ghi là "đôi khi" nếu đáng giữ.\n' +
  '- Ghi rõ tần suất cho từng quy tắc: "luôn", "thường", "đôi khi".\n' +
  "- Khi chỉ có một kịch bản, vẫn làm nhưng thận trọng: tránh khẳng định những gì có thể chỉ do chủ đề.\n\n" +
  "Với tài liệu: tài liệu có thể là hướng dẫn giọng văn/thương hiệu, văn bản mẫu, hoặc kiến thức chuyên môn.\n" +
  "- Quy tắc được người dùng viết rõ trong tài liệu (nên/không nên, xưng hô, từ cấm…) được ƯU TIÊN hơn suy luận từ kịch bản; ghi vào phần tương ứng.\n" +
  "- Văn bản mẫu trong tài liệu được dùng như kịch bản để học giọng.\n" +
  "- Kiến thức chuyên môn (sản phẩm, thuật ngữ, sự thật cốt lõi, đối tượng người xem) → tóm tắt ngắn gọn những điều người viết PHẢI nhớ vào knowledgeGuide.\n" +
  "- Không có kịch bản nào thì học giọng văn từ tài liệu.\n\n" +
  "Trả về các trường:\n" +
  '- name: tên skill ngắn gọn (2–6 từ) gợi đúng chất giọng, ví dụ "Kể chuyện hài hước đời thường".\n' +
  "- description: 1–2 câu cho biết skill dùng cho loại video nào.\n" +
  "- genre: thể loại video. styleTags: 3–8 từ khoá phong cách. toneDescription: 1–2 câu tả tông/giọng điệu.\n" +
  "- voiceGuide: hướng dẫn GIỌNG VĂN, dạng gạch đầu dòng mệnh lệnh, cụ thể và làm theo được: ngôi kể và cách xưng hô với người xem; độ dài và nhịp câu; mức trang trọng, khẩu ngữ, tiếng lóng, từ địa phương; từ vựng và cụm từ đặc trưng hay lặp lại; biện pháp tu từ (so sánh, câu hỏi tu từ, phóng đại, chơi chữ…); cách tạo cảm xúc và hài hước; dấu câu, cách ngắt nhịp để đọc thành lời.\n" +
  "- styleGuide: hướng dẫn PHONG CÁCH và CẤU TRÚC, dạng gạch đầu dòng: kiểu hook mở đầu (mấy giây đầu nói gì); cách triển khai và chuyển ý; nhịp thông tin; cao trào; cách kết và lời kêu gọi hành động; độ dài tổng thể; những gì tác giả này KHÔNG làm (để tránh).\n" +
  "- visualGuide: nếu có dữ liệu phân cảnh thì viết hướng dẫn PHONG CÁCH HÌNH ẢNH và DỰNG (cỡ cảnh hay dùng, chuyển động máy, độ dài cảnh, khoảnh khắc nhấn, loại tư liệu hình ảnh); nếu không có thì trả chuỗi rỗng.\n" +
  "- knowledgeGuide: kiến thức và quy tắc rút từ tài liệu (gạch đầu dòng); chuỗi rỗng nếu không có tài liệu hoặc tài liệu không có gì đáng giữ.\n" +
  "- sampleLines: 2–5 câu NGẮN trích nguyên văn thể hiện rõ nhất chất giọng, lấy từ các nguồn khác nhau nếu có nhiều.\n\n" +
  'Nguyên tắc: mô tả CÁCH viết, không tóm tắt NỘI DUNG của từng kịch bản; không đưa tên riêng, số liệu, sự kiện cụ thể của các kịch bản mẫu vào hướng dẫn (trừ trong sampleLines và knowledgeGuide); hướng dẫn phải đủ cụ thể để phân biệt giọng này với giọng khác — tránh nhận xét chung chung kiểu "hấp dẫn, lôi cuốn". Viết các hướng dẫn bằng tiếng Việt.';

const DEFAULT_REFINE_PROMPT =
  "Đây là lần HUẤN LUYỆN TÍCH LUỸ: skill này ĐÃ CÓ bộ hướng dẫn (bên dưới), là bản tổng hợp từ các nguồn đã học trước đây. Các nguồn được đánh dấu [đã học] (đã nằm trong bản hướng dẫn) và [MỚI] (lần này mới thêm). Hãy KẾT HỢP và TỔNG HỢP LẠI toàn bộ thành một bộ hướng dẫn mới — KHÔNG kết luận chỉ từ nguồn mới, KHÔNG viết lại từ đầu:\n" +
  "- Coi bộ hướng dẫn hiện tại là bằng chứng của TẤT CẢ nguồn đã học. Một vài nguồn mới không được ghi đè điều mà nhiều nguồn cũ cùng thể hiện.\n" +
  "- Quy tắc cũ được nguồn mới khẳng định → giữ và có thể nâng tần suất (đôi khi → thường → luôn).\n" +
  '- Nguồn mới thể hiện khác với quy tắc cũ → giữ quy tắc cũ, ghi thêm biến thể ("đôi khi…", "với chủ đề X thì…"); chỉ đổi hẳn quy tắc khi phần lớn nguồn (cả cũ lẫn mới) cùng cho thấy điều khác.\n' +
  "- Đặc điểm mới lặp lại ở nhiều nguồn mà bản cũ chưa có → bổ sung.\n" +
  "- Không xoá một quy tắc chỉ vì nguồn mới không thể hiện nó.\n" +
  "- Kiến thức từ tài liệu: gộp với kiến thức cũ, bỏ trùng lặp; tài liệu mới chỉ thay thế điều cũ khi nói rõ điều đó.\n" +
  "- Giữ các ghi chú do người dùng tự viết thêm nếu chúng không mâu thuẫn với nguồn.\n" +
  "- sampleLines: chọn lại từ cả nguồn cũ và mới.";

/** The bits of an analysis that show visual/editing style, small enough for a prompt. */
function scenesForPrompt(scenes: ScriptScene[], limit: number): string {
  const compact = scenes.slice(0, limit).map((scene) => ({
    role: scene.narrativeRole,
    shot: scene.shotSize,
    camera: scene.cameraMovement,
    sec: scene.estimatedDurationSec,
    hero: scene.heroMoment,
    visual: scene.visualDescription.slice(0, 160),
    assets: scene.requiredAssets.map((asset) => asset.type),
  }));
  return JSON.stringify(compact);
}

function trimTo(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max)}\n[… lược bớt phần còn lại]`
    : text;
}

/** "[MỚI]" for material added in this run, "[đã học]" for material the guide already covers. */
function tagOf(material: TrainingMaterial, refining: boolean): string {
  if (!refining) return "";
  return material.isNew ? " [MỚI]" : " [đã học]";
}

function bullets(title: string, lines: string[]): string {
  return lines.length > 0
    ? `${title}:\n${lines.map((line) => `- ${line}`).join("\n")}`
    : "";
}

/** A source read in full beforehand: its notes plus a verbatim opening, not a cut-off text. */
function digestedBody(material: TrainingMaterial): string {
  const digest = material.digest!;
  const read =
    `(Đã đọc toàn bộ ${digest.chars.toLocaleString("vi-VN")} ký tự` +
    (digest.parts > 1 ? ` qua ${digest.parts} phần` : "") +
    " — dưới đây là ghi chú và đoạn mở đầu nguyên văn.)";
  return [
    read,
    bullets("Ghi chú giọng văn", digest.voice),
    bullets("Ghi chú cấu trúc", digest.structure),
    bullets("Ghi chú hình ảnh & dựng", digest.visual),
    bullets("Kiến thức & quy tắc", digest.knowledge),
    bullets(
      "Câu mẫu",
      digest.sampleLines.map((line) => `"${line}"`),
    ),
    `Đoạn mở đầu nguyên văn:\n"""\n${trimTo(material.text, BUDGET.excerptOfDigested)}\n"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sectionOf(
  material: TrainingMaterial,
  label: string,
  share: number,
  refining: boolean,
): string {
  const head = `### ${label}${tagOf(material, refining)}: ${material.title}`;
  const body = material.digest
    ? digestedBody(material)
    : `"""\n${trimTo(material.text, share)}\n"""`;
  if (material.role !== "sample") return `${head}\n${body}`;
  const scenes =
    material.scenes && material.scenes.length > 0
      ? `\nPhân cảnh (JSON rút gọn): ${scenesForPrompt(
          material.scenes,
          material.isNew || !refining
            ? SCENES_PER_SCRIPT
            : SCENES_PER_LEARNED_SCRIPT,
        )}`
      : "\n(Chưa phân tích phân cảnh.)";
  return `${head}\n${body}${scenes}`;
}

/** New material first, so it is never the part cut short. */
export function newFirst(items: TrainingMaterial[]): TrainingMaterial[] {
  return [...items.filter((m) => m.isNew), ...items.filter((m) => !m.isNew)];
}

/**
 * The user turn of the training call: every source, new ones first, verbatim
 * within its share of the budget — or as notes + excerpt when it was read in
 * parts beforehand (`digests.ts`).
 */
export function userTextOf(
  materials: TrainingMaterial[],
  refining: boolean,
  /** The output field to tell the AI to leave empty when no scene data exists — differs by which task reuses this builder. */
  emptyScenesField = "visualGuide",
): string {
  const samples = newFirst(materials.filter((m) => m.role === "sample"));
  const references = newFirst(materials.filter((m) => m.role === "reference"));
  const sampleShares = sharesOf(samples, BUDGET.samples);
  const referenceShares = sharesOf(references, BUDGET.references);
  const added = materials.filter((m) => m.isNew).length;

  return [
    `Số kịch bản: ${samples.length}. Số tài liệu: ${references.length}.` +
      (refining
        ? ` Trong đó ${added} nguồn [MỚI] và ${materials.length - added} nguồn [đã học].`
        : ""),
    ...samples.map((m, i) =>
      sectionOf(m, `Kịch bản ${i + 1}`, sampleShares[i]!, refining),
    ),
    ...references.map((m, i) =>
      sectionOf(m, `Tài liệu ${i + 1}`, referenceShares[i]!, refining),
    ),
    samples.every((m) => !m.scenes?.length && !m.digest?.visual.length)
      ? `(Không có dữ liệu phân cảnh — để ${emptyScenesField} rỗng.)`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const trainSkillTask = defineTask<TrainSkillInput, TrainSkillOutput>({
  key: "training.skill",
  module: "training",
  label: {
    en: "Train a Script skill from scripts and documents",
    vi: "Huấn luyện skill Kịch bản từ kịch bản và tài liệu",
  },
  description: {
    en: "Compares scripts by the same author and reads reference documents, then writes the voice, structure and knowledge guide saved as a Script skill — or refines an existing skill's guide. Editing skills (shot/cut style) have their own separate training prompt below.",
    vi: "So sánh các kịch bản của cùng tác giả và đọc tài liệu tham khảo, rồi viết bộ hướng dẫn giọng văn, cấu trúc và kiến thức lưu thành skill Kịch bản — hoặc tinh chỉnh skill có sẵn. Skill Phân cảnh (phong cách dựng) có prompt huấn luyện riêng ở mục bên dưới.",
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
      throw new Error("Cần ít nhất một kịch bản hoặc tài liệu để huấn luyện.");
    }
    const currentGuide = input.currentGuide?.trim();
    const refining = Boolean(currentGuide);
    const system =
      promptOf(ctx, this, "system") +
      (refining
        ? `\n\n${promptOf(ctx, this, "refine")}\n\nBộ hướng dẫn hiện tại:\n"""\n${currentGuide}\n"""`
        : "");

    const result = await providerFor(
      ctx,
      input.provider,
    ).generateStructured<TrainSkillOutput>({
      model: input.model ?? defaultModelFor(input.provider),
      system,
      text: userTextOf(input.materials, refining),
      effort: input.effort ?? "medium",
      schema: TRAIN_SKILL_SCHEMA,
      schemaName: "train_skill",
      maxTokens: SKILL_GUIDE_OUTPUT_TOKENS,
    });
    if (!result || !result.voiceGuide?.trim()) {
      throw new Error("AI không trả về hướng dẫn giọng văn hợp lệ.");
    }
    return result;
  },
});
