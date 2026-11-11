import { ANALYSIS_PASSAGE_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { ScriptAnalyzeResult } from "../../../../shared/types.js";
import {
  buildContext,
  type ContextInput,
} from "../../../services/ai/context.js";
import type {
  AiEffort,
  ProviderKey,
} from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";
import {
  ASSET_LAYER_RULE,
  DIRECTOR_RULE,
  SCRIPT_ANALYSIS_SCHEMA,
  withAssetLayers,
} from "../schema.js";

export interface AnalyzeScriptInput {
  scriptText: string;
  frames: string[];
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
  /** Skill, approved examples and reference documents to ground the analysis. */
  context?: ContextInput;
  /** Character roster already locked in for this script (name + description, free text) — use these exact names instead of inventing new ones. */
  knownCharacters?: string;
  /** Recurring object/prop roster already locked in for this script — use these exact names in requiredAssets descriptions instead of inventing new wording for the same thing. */
  knownObjects?: string;
  /** A type "editing" skill's locked shot/cut/pacing methodology, applied as a hard constraint independent of `context`'s skill. */
  editingStyle?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "Bạn là trợ lý sản xuất video. Đọc kịch bản người dùng cung cấp, chia thành các phân cảnh hợp lý theo thứ tự. Mỗi cảnh gồm:\n" +
  "- content: nội dung/thoại/hành động diễn ra trong cảnh.\n" +
  '- visualDescription: mô tả hình ảnh CHI TIẾT và SỐNG ĐỘNG, viết như đang kể lại cảnh quay cho một người hoàn toàn chưa xem video và sẽ không được xem ảnh minh hoạ — họ chỉ có đúng đoạn mô tả này để hình dung. Tối thiểu 3-4 câu cụ thể, nêu rõ: bối cảnh/địa điểm, thời điểm trong ngày và kiểu ánh sáng, nhân vật xuất hiện (ngoại hình, trang phục, tư thế, biểu cảm, hành động đang làm), màu sắc chủ đạo, bố cục khung hình, và các chi tiết đáng chú ý trong nền hoặc chữ/overlay nếu có. Tránh câu chung chung kiểu "một người đang đứng trong phòng" — hãy cụ thể hoá tối đa những gì thực sự quan sát được (hoặc, nếu không có khung hình tham khảo, những gì hợp lý nhất để hình dung từ kịch bản).\n' +
  "- thời lượng ước tính tính bằng giây, vai trò trong mạch truyện (narrativeRole), cỡ cảnh gợi ý (shotSize), chuyển động máy quay gợi ý (cameraMovement), có phải là cảnh cao trào/đáng chia sẻ nhất không (heroMoment), và danh sách tài nguyên cần cho riêng cảnh đó (requiredAssets: loại, mô tả, nguồn sinh/tìm/đã có).\n" +
  "- characters: danh sách NHÂN VẬT (người/con vật có vai trò riêng trong câu chuyện) xuất hiện trong cảnh này, mỗi người gồm `name` (tên/định danh ngắn gọn) và `action` (hành động/cử chỉ cụ thể họ đang làm trong cảnh, ngắn gọn). Dùng ĐÚNG MỘT tên nhất quán cho cùng một nhân vật xuyên suốt toàn bộ kịch bản (không đổi cách gọi giữa chừng, ví dụ không lúc gọi \"Người dẫn chuyện\" lúc gọi \"MC\") để đếm và gom nhóm chính xác được số nhân vật khác nhau trong cả video. Cảnh không có ai xuất hiện (chỉ cảnh vật/đồ vật/chữ) thì để mảng rỗng.\n" +
  "Với mỗi tài nguyên trong requiredAssets, chọn đúng `source` theo nguyên tắc: NHÂN VẬT cụ thể (ngoại hình, trang phục, biểu cảm riêng của một người/con vật trong câu chuyện) và VẬT PHẨM/đồ vật đặc thù (có chi tiết/hình dạng riêng, hoặc ảnh ghép có chú thích tuỳ chỉnh như bản đồ có ghim, biểu đồ có số liệu riêng, ảnh có chữ overlay cụ thể) hầu như chắc chắn KHÔNG có sẵn y hệt trên mạng → dùng `generate` (cần AI tạo mới). Ngược lại, BỐI CẢNH/NỀN chung chung (văn phòng, thiên nhiên, thành phố, bầu trời, đường phố, phong cảnh, b-roll minh hoạ không cần đúng y hệt, chỉ cần đúng không khí/chủ đề) thường tìm được ảnh/video có sẵn → dùng `stock` (tìm trên mạng), không cần tạo mới tốn kém. Chỉ dùng `provided` khi rõ ràng đây là tài sản riêng của người dùng (logo thương hiệu của họ, ảnh thật họ tự chụp...).\n" +
  DIRECTOR_RULE +
  "\n" +
  ASSET_LAYER_RULE +
  "\n" +
  "Ngoài ra liệt kê tài nguyên tổng thể cần chuẩn bị để quay/dựng (số cảnh quay, giọng đọc cần, nhạc nền, hình ảnh/b-roll cần, ghi chú khác), và tóm tắt phong cách tổng thể (thể loại, các từ khoá phong cách, mô tả tone/giọng điệu) để có thể lưu lại dùng cho các video sau. Trả lời bằng cùng ngôn ngữ với kịch bản gốc.";

const DEFAULT_FRAMES_HINT =
  "Ngoài kịch bản, bạn còn được cung cấp một số khung hình (ảnh tĩnh) lấy đều theo thời gian từ chính video gốc, theo đúng thứ tự thời gian, ở độ phân giải cao — hãy nhìn kỹ từng khung hình (màu sắc, ánh sáng, nhân vật, chữ/overlay xuất hiện trong ảnh, bối cảnh, chi tiết nền) để viết visualDescription chính xác và cụ thể, thay vì chỉ đoán từ chữ. Đặc biệt chú ý ĐỌC KỸ mọi chữ/số nhỏ xuất hiện trong khung hình (tin nhắn, đồng hồ, mốc thời gian, chỉ số, tên hiển thị...) — khoảng cách thời gian hoặc con số cụ thể giữa các khung hình thường chính là điểm nhấn/điểm hài của video (ví dụ: 2 mốc giờ trong một đoạn chat cách nhau rất ngắn cho thấy nhân vật di chuyển/phản hồi nhanh bất thường), đừng bỏ qua chi tiết này. Khung hình có thể không khớp chính xác từng phân cảnh vì được lấy mẫu đều theo thời gian (không theo điểm cắt cảnh thật). Nếu một khung hình có nội dung/phong cách hình ảnh khác hẳn các khung hình xung quanh (ví dụ chuyển sang một đoạn clip/thể loại khác hẳn), đừng vội kết luận đó là lỗi chèn nhầm — trước tiên hãy xét xem nó có thể là một ẩn dụ/so sánh hài hước có chủ đích hay không (ví dụ: chèn hình ảnh vận động viên tốc độ để ví von một hành động diễn ra rất nhanh trong câu chuyện), dựa trên mạch truyện và các chi tiết thời gian/số liệu đã đọc được. Chỉ ghi nhận là bất thường/không liên quan khi thực sự không tìm ra được mối liên hệ hợp lý nào.";

export const analyzeScriptTask = defineTask<
  AnalyzeScriptInput,
  ScriptAnalyzeResult
>({
  key: "script.analyze",
  module: "script",
  group: "analyze",
  label: {
    en: "Analyze script into scenes",
    vi: "Phân tích kịch bản thành cảnh",
  },
  description: {
    en: "Splits the script into scenes with visuals, timing, framing and required assets, and summarizes the overall style.",
    vi: "Chia kịch bản thành các cảnh kèm mô tả hình ảnh, thời lượng, cỡ cảnh, tài nguyên cần có, và tóm tắt phong cách tổng thể.",
  },
  prompts: [
    {
      key: "system",
      label: { en: "Main instructions", vi: "Hướng dẫn chính" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
    {
      key: "framesHint",
      label: {
        en: "Extra instructions when frames are attached",
        vi: "Hướng dẫn thêm khi có khung hình",
      },
      description: {
        en: "Appended only when the script comes with frames sampled from the source video.",
        vi: "Chỉ được thêm vào khi kịch bản có kèm khung hình lấy từ video gốc.",
      },
      default: DEFAULT_FRAMES_HINT,
    },
  ],

  async run(input, ctx) {
    const provider = providerFor(ctx, input.provider);
    const hasFrames = input.frames.length > 0;
    const knownCharacters = input.knownCharacters?.trim();
    const knownObjects = input.knownObjects?.trim();
    const editingStyle = input.editingStyle?.trim();
    const system =
      promptOf(ctx, this, "system") +
      buildContext(input.context ?? {}) +
      (hasFrames ? `\n\n${promptOf(ctx, this, "framesHint")}` : "") +
      (knownCharacters
        ? `\n\nDanh sách nhân vật đã chốt trước cho toàn bộ kịch bản (đoạn bạn đang phân tích chỉ là MỘT PHẦN của kịch bản dài hơn):\n${knownCharacters}\n` +
          "Với mỗi nhân vật xuất hiện trong đoạn này, nếu khớp một nhân vật trong danh sách trên thì PHẢI dùng ĐÚNG tên đã cho (không tự đổi cách viết/viết tắt). Chỉ thêm nhân vật mới ngoài danh sách này nếu đoạn này thực sự có người/con vật khác không nằm trong danh sách."
        : "") +
      (knownObjects
        ? `\n\nDanh sách vật phẩm/đồ vật đặc thù đã chốt trước cho toàn bộ kịch bản:\n${knownObjects}\n` +
          "Nếu cảnh này cần tài nguyên liên quan tới một trong các vật phẩm trên, mô tả requiredAssets PHẢI nhắc ĐÚNG tên vật phẩm đã cho (không tự đổi cách gọi), để nhận ra đây là cùng một vật phẩm xuyên suốt."
        : "") +
      (editingStyle
        ? `\n\nPhong cách dựng/phân cảnh cố định (bắt buộc áp dụng khi chọn shotSize, cameraMovement, heroMoment và cách chia cảnh): ${editingStyle}`
        : "");

    const result = await provider.generateStructured<ScriptAnalyzeResult>({
      maxTokens: ANALYSIS_PASSAGE_OUTPUT_TOKENS,
      model: input.model ?? defaultModelFor(input.provider),
      system,
      text: input.scriptText,
      images: input.frames,
      effort: input.effort ?? "medium",
      schema: SCRIPT_ANALYSIS_SCHEMA,
      schemaName: "script_analysis",
    });
    if (!result) {
      throw new Error(
        input.provider === "claude"
          ? "Claude không trả về nội dung phân tích hợp lệ."
          : "OpenAI không trả về nội dung phân tích.",
      );
    }
    return withAssetLayers(result);
  },
});
