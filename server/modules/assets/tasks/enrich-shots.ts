import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ScriptScene } from "../../../../shared/types.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";
import { assetsForPrompt } from "../../script/schema.js";

export interface EnrichShotsInput {
  /** A handful of consecutive scenes of an analysis (with their shots and images). */
  scenes: ScriptScene[];
  /** The recurring characters' names (a shot showing only one of them on a plain backdrop is what gets enriched). */
  rosterNames?: string[];
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

/** Per shot that needs it: icons to pop in, real photos to research and key words to show. */
export interface EnrichShotsOutput {
  shots: { scene: number; shot: number; stickers: string[]; photos: string[]; callouts: string[] }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "integer" },
          shot: { type: "integer" },
          stickers: { type: "array", items: { type: "string" } },
          photos: { type: "array", items: { type: "string" } },
          callouts: { type: "array", items: { type: "string" } },
        },
        required: ["scene", "shot", "stickers", "photos", "callouts"],
        additionalProperties: false,
      },
    },
  },
  required: ["shots"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là EDITOR video YouTube kiến thức hoạt hình, ám ảnh với việc giữ chân người xem. Nhiều shot trong video chỉ có người dẫn đứng nói trên nền trơn (nền giấy, nền màu, nền mờ) — người xem chán và bỏ đi. Nhiệm vụ: với các cảnh được cho, chọn những shot như vậy và thêm minh hoạ bật ra cạnh người dẫn.\n" +
  "- CHỈ chọn shot mà khung hình chỉ có người dẫn (hoặc một nhân vật) trên nền trơn/nền giấy/nền mờ, dài từ 2 giây trở lên. BỎ QUA shot đã có ảnh minh hoạ, chữ, bảng, màn hình, bối cảnh thật đầy đủ (phòng, văn phòng, ngoài trời…), hoặc shot cận đặc mặt.\n" +
  "- `stickers`: 1–3 icon/sticker minh hoạ ĐÚNG ý đang nói trong shot đó (danh từ, sự vật, cảm xúc then chốt trong lời thoại) — mỗi cái mô tả ngắn gọn như một icon dễ vẽ: vật thể đơn lẻ, nét rõ, ví dụ \"trái tim đỏ vỡ đôi\", \"điện thoại có chuông báo đỏ\", \"dấu chấm hỏi vàng\", \"ổ khoá bị mở\". Shot dài hơn thì nhiều hơn (khoảng 1 icon mỗi 1,5–2,5 giây). Không dùng chữ trong icon. Không lặp icon giống nhau giữa các shot liền nhau.\n" +
  "- `photos`: 0–1 ẢNH THẬT khi lời thoại nhắc tới thứ có thật ngoài đời (sự kiện, người nổi tiếng, địa danh, sản phẩm/thương hiệu, tin tức, số liệu, đồ vật đời thường dễ chụp) — ghi đúng thứ cần tìm như một câu tìm kiếm ảnh cụ thể, ví dụ \"ảnh chụp màn hình thông báo ngân hàng trên điện thoại\", \"ảnh thật đám cưới Việt Nam ngoài trời\". Khoảng 15–20 giây có một ảnh thật; KHÔNG dùng ảnh thật cho nhân vật của câu chuyện hay cảnh tưởng tượng. Ảnh thật thay cho sticker khi minh hoạ cùng một ý.\n" +
  "- VÍ DỤ PHẢI CÓ HÌNH: khi lời thoại đưa ví dụ hoặc liệt kê, MỖI ví dụ phải có một sticker hoặc một ảnh thật — không chỉ chữ.\n" +
  "- `callouts`: 0–1 cụm chữ khoá (2–5 từ, lấy đúng từ ngữ trong lời thoại của shot, viết hoa chữ đầu) — câu \"đắt\" nhất của shot để hiện thành chữ to bật lên. Không lặp lại chữ đã có sẵn trên hình.\n" +
  "- `scene` và `shot` là số cảnh và số thứ tự shot như đã cho. Chỉ trả về những shot cần thêm; không có thì trả về danh sách rỗng.\n" +
  "- Viết bằng cùng ngôn ngữ với cảnh.";

/**
 * Picks the shots where a speaker is alone on a plain backdrop and lists, for
 * each, icons to pop in beside them and a key phrase to show — so the edit
 * keeps adding something new every couple of seconds. Existing images are
 * untouched; the icons become cells of new sticker-sheet assets.
 */
export const enrichShotsTask = defineTask<EnrichShotsInput, EnrichShotsOutput>({
  key: "asset.enrichShots",
  module: "assets",
  label: { en: "Enrich shots (stickers & key words)", vi: "Bổ sung minh hoạ (sticker & chữ khoá)" },
  description: {
    en: "Finds shots where the speaker is alone on a plain backdrop and adds icons that pop in beside them and a key phrase from the narration — drawn as sticker sheets, placed by the edit plan.",
    vi: "Tìm các shot chỉ có người dẫn trên nền trơn và thêm icon bật ra cạnh người dẫn cùng cụm chữ khoá từ lời thoại — vẽ thành các tấm sticker, bộ dựng tự đặt vào.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const scenes = input.scenes.map((scene) => ({
      scene: scene.index,
      narration: scene.narration ?? scene.content,
      shots: (scene.shots ?? []).map((shot) => ({
        shot: shot.order,
        durationSec: shot.durationSec,
        shotSize: shot.shotSize,
        subject: shot.subject,
        images: assetsForPrompt(scene.requiredAssets.filter((a) => a.shot === shot.order || !a.shot)).map(
          (a) => `[${a.type}${a.layer ? `/${a.layer}` : ""}] ${a.description}`,
        ),
      })),
    }));
    const result = await providerFor(ctx, input.provider).generateStructured<EnrichShotsOutput>({
      maxTokens: 8000,
      model: input.model ?? defaultModelFor(input.provider),
      effort: input.effort ?? "low",
      system: promptOf(ctx, this, "system"),
      text: [
        input.rosterNames?.length ? `Nhân vật cố định: ${input.rosterNames.join(", ")}` : null,
        `Các cảnh:\n${JSON.stringify(scenes, null, 2)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: SCHEMA,
      schemaName: "enrich_shots",
    });
    const known = new Set(input.scenes.flatMap((s) => (s.shots ?? []).map((shot) => `${s.index}:${shot.order}`)));
    return {
      shots: (result?.shots ?? [])
        .filter((s) => known.has(`${s.scene}:${s.shot}`))
        .map((s) => ({
          scene: s.scene,
          shot: s.shot,
          stickers: s.stickers.map((t) => t.trim()).filter(Boolean).slice(0, 4),
          photos: s.photos.map((t) => t.trim()).filter(Boolean).slice(0, 2),
          callouts: s.callouts.map((t) => t.trim()).filter(Boolean).slice(0, 1),
        })),
    };
  },
});
