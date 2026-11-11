import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { RequiredAsset, SceneShot, ScriptScene } from "../../../../shared/types.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import { ANALYSIS_PASSAGE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defineTask, promptOf, providerFor } from "../../../services/ai/task.js";
import {
  ASSET_LAYER_RULE,
  DIRECTOR_RULE,
  REQUIRED_ASSET_ITEM_SCHEMA,
  SCENE_SHOT_SCHEMA,
  withAssetLayers,
} from "../../script/schema.js";

export interface SplitLayersInput {
  /** A handful of scenes of an existing analysis. */
  scenes: ScriptScene[];
  /** Names of the script's recurring characters/objects, to keep them spelled the same. */
  rosterNames?: string[];
  /** The video's editing skill (shot/cut/pacing methodology), when it has one. */
  editingStyle?: string;
  /** The scene right before this batch, for continuity only (not re-planned). */
  previousScene?: ScriptScene;
  provider: ProviderKey;
}

export interface SplitLayersOutput {
  /** Each scene given, re-planned: its shots and the images each shot needs. */
  scenes: { index: number; shots: SceneShot[]; requiredAssets: RequiredAsset[] }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          shots: { type: "array", items: SCENE_SHOT_SCHEMA },
          requiredAssets: { type: "array", items: REQUIRED_ASSET_ITEM_SCHEMA },
        },
        required: ["index", "shots", "requiredAssets"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là ĐẠO DIỄN HOẠT HÌNH KỂ CHUYỆN giàu kinh nghiệm, kiêm người chuẩn bị tư liệu hình ảnh, cho một video đã được phân tích thành cảnh — hãy làm video sinh động và thú vị bằng các shot và kỹ thuật đạo diễn phù hợp. Với MỖI cảnh được cho (nội dung, lời thoại, mô tả hình ảnh, nhân vật, thời lượng, các shot và tư liệu hiện có), lên lại kế hoạch quay: danh sách `shots` và danh sách `requiredAssets` cho từng shot, theo các quy tắc bên dưới.\n" +
  "- Giữ nguyên các tài nguyên âm thanh/video (layer \"none\", shot = 0).\n" +
  "- Xét lại CẢ các shot và ảnh đã có: shot nào thiếu (vd. sự kiện không có shot phản ứng, khán giả cần đọc màn hình mà không có shot qua vai/insert), ảnh nào chưa đủ để diễn (nhân vật có thoại/hành động mà chỉ có một ảnh tĩnh, nhiều nhịp mà chỉ một sprite sheet) hay vô lý (vd. nhân vật đang xem điện thoại mà màn hình quay ra máy quay) thì sửa/bổ sung; phần đã đúng thì giữ nguyên.\n" +
  "- `source`: nền/bối cảnh chung chung tìm được trên mạng → \"stock\"; nền phải khớp chi tiết riêng của câu chuyện và mọi cutout nhân vật/vật phẩm → \"generate\"; giữ \"provided\" nếu đã có.\n" +
  "- MỌI ảnh phải có `shot` (thuộc shot nào) và `placement` theo đúng góc máy của shot đó.\n" +
  "- Dùng ĐÚNG tên nhân vật/vật phẩm như danh sách đã cho, không đổi cách gọi.\n" +
  "- Các cảnh được cho là các cảnh LIỀN NHAU: lên shot sao cho nối mạch giữa chúng (và với cảnh ngay trước nếu có).\n" +
  "- Trả về đủ mọi cảnh được cho, đúng `index`, theo cùng thứ tự; viết bằng cùng ngôn ngữ với cảnh.\n" +
  DIRECTOR_RULE +
  "\n" +
  ASSET_LAYER_RULE;

export const splitLayersTask = defineTask<SplitLayersInput, SplitLayersOutput>({
  key: "asset.splitLayers",
  module: "assets",
  label: { en: "Plan shots & layers", vi: "Phân shot & tách lớp" },
  description: {
    en: "Re-plans analyzed scenes like a film director: breaks each into shots (establishing, insert, reaction, over-the-shoulder...) and lists the images each shot needs — backgrounds, cutouts and sprite sheets drawn for that shot's framing.",
    vi: "Lên lại kế hoạch quay cho các cảnh đã phân tích như một đạo diễn: chia mỗi cảnh thành các shot (toàn cảnh, insert, phản ứng, qua vai...) và liệt kê ảnh mỗi shot cần — nền, PNG, sprite sheet vẽ đúng góc máy của shot đó.",
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
      index: scene.index,
      content: scene.content,
      visualDescription: scene.visualDescription,
      estimatedDurationSec: scene.estimatedDurationSec,
      narrativeRole: scene.narrativeRole,
      shotSize: scene.shotSize,
      cameraMovement: scene.cameraMovement,
      characters: scene.characters ?? [],
      shots: scene.shots ?? [],
      requiredAssets: scene.requiredAssets,
    }));
    const editingStyle = input.editingStyle?.trim();
    const result = await providerFor(ctx, input.provider).generateStructured<SplitLayersOutput>({
      maxTokens: ANALYSIS_PASSAGE_OUTPUT_TOKENS,
      model: defaultModelFor(input.provider),
      system:
        promptOf(ctx, this, "system") +
        (editingStyle
          ? `\n\nPhong cách dựng/phân cảnh cố định (bắt buộc áp dụng khi chia shot, chọn cỡ cảnh, góc máy và nhịp cắt): ${editingStyle}`
          : ""),
      text: [
        input.rosterNames?.length
          ? `Nhân vật/vật phẩm cố định: ${input.rosterNames.join(", ")}`
          : null,
        input.previousScene
          ? `Cảnh ngay trước (CHỈ để nối mạch, KHÔNG trả về): ${JSON.stringify({
              index: input.previousScene.index,
              content: input.previousScene.content,
              lastShot: input.previousScene.shots?.at(-1) ?? null,
            })}`
          : null,
        `Các cảnh cần lên kế hoạch:\n${JSON.stringify(scenes, null, 2)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      effort: "medium",
      schema: SCHEMA,
      schemaName: "plan_shots_layers",
    });
    if (!result?.scenes?.length) throw new Error("AI không trả về kế hoạch shot và tư liệu.");
    // Same normalization as a fresh analysis: shots in order, image-only fields
    // dropped from audio/video, links to missing shots removed.
    const normalized = withAssetLayers({
      scenes: result.scenes.map((scene) => ({
        ...(input.scenes.find((s) => s.index === scene.index) ?? input.scenes[0]!),
        index: scene.index,
        shots: scene.shots,
        requiredAssets: scene.requiredAssets,
      })),
    });
    return {
      scenes: normalized.scenes.map((scene) => ({
        index: scene.index,
        shots: scene.shots ?? [],
        requiredAssets: scene.requiredAssets,
      })),
    };
  },
});
