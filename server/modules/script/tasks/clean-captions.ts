import { SCRIPT_OUTPUT_TOKENS } from "../../../services/ai/limits.js";
import { defaultModelFor } from "../../../../shared/script-cost-estimate.js";
import type { AiEffort, ProviderKey } from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";

export interface CleanCaptionsInput {
  /** The video's speech as text: its captions, or a Whisper transcription of its audio. */
  captions: string;
  /** Where the text came from (told to the model). Default "captions". */
  kind?: "captions" | "transcript";
  /** Frames spread over the whole video, to check names and on-screen text. */
  frames: string[];
  provider: ProviderKey;
  model?: string;
  effort?: AiEffort;
}

/** Enough frames (spread over the whole video) to read names/on-screen text without paying for all of them. */
const MAX_FRAMES = 24;

const DEFAULT_SYSTEM_PROMPT =
  "Bạn nhận lời thoại của một video dưới dạng chữ — phụ đề của trang nguồn hoặc bản phiên âm tự động từ audio (thường thiếu dấu câu, lặp chữ, nghe nhầm từ, sai tên riêng) — kèm các khung hình lấy đều trên TOÀN BỘ video. Hãy xem hết các khung hình rồi biên tập lời thoại thành kịch bản sạch, đọc được:\n" +
  "- Giữ NGUYÊN ngôn ngữ, ý và thứ tự lời thoại; KHÔNG thêm thông tin, KHÔNG tóm tắt, KHÔNG viết lại theo văn phong khác.\n" +
  "- Thêm dấu câu, viết hoa đúng chỗ, chia đoạn theo ý; bỏ chữ lặp và các từ đệm vô nghĩa (ừm, à...) khi không ảnh hưởng nội dung.\n" +
  "- Sửa từ nghe nhầm khi ngữ cảnh cho thấy rõ từ đúng; đối chiếu tên riêng, thương hiệu, con số với chữ xuất hiện trong khung hình để viết cho đúng.\n" +
  "- Chỗ nào không chắc thì giữ như bản gốc, không đoán.\n" +
  "Chỉ trả về kịch bản đã biên tập, không thêm lời dẫn hay giải thích.";

/** Evenly spaced subset, keeping first and last. */
function sampleFrames(frames: string[], max: number): string[] {
  if (frames.length <= max) return frames;
  const step = (frames.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => frames[Math.round(i * step)]!);
}

/** Key kept as `script.cleanCaptions` so existing prompt overrides still apply. */
export const cleanCaptionsTask = defineTask<CleanCaptionsInput, string>({
  key: "script.cleanCaptions",
  module: "script",
  group: "link",
  label: {
    en: "Watch the video and edit its speech",
    vi: "Xem video và biên tập lời thoại",
  },
  description: {
    en: 'The AI picked for the link (Claude by default) looks at frames from the whole video and edits its speech — the Whisper transcription, or the site\'s captions without an OpenAI key: punctuation, paragraphs, misheard words, names and on-screen text. Checking/describing use the prompts under "Upload a video".',
    vi: 'AI chọn cho link (mặc định Claude) xem khung hình của toàn bộ video và biên tập lời thoại — bản phiên âm Whisper, hoặc phụ đề của trang nguồn khi chưa có OpenAI key: dấu câu, chia đoạn, từ nghe nhầm, tên riêng và chữ trên màn hình. Phần kiểm tra/mô tả dùng prompt ở tab "Tải video lên".',
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const source =
      input.kind === "transcript"
        ? "Bản phiên âm tự động từ audio"
        : "Phụ đề của video";
    const text = await providerFor(ctx, input.provider).generateText({
      model: input.model ?? defaultModelFor(input.provider),
      system: promptOf(ctx, this, "system"),
      text: `${source}:\n\n${input.captions}`,
      images: sampleFrames(input.frames, MAX_FRAMES),
      effort: input.effort ?? "low",
      maxTokens: SCRIPT_OUTPUT_TOKENS,
    });
    return text.trim();
  },
});
