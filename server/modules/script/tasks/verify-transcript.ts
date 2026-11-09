import {
  defaultModelFor,
  GPT_4_1_MODEL,
} from "../../../../shared/script-cost-estimate.js";
import type { ProviderKey } from "../../../services/ai/providers/index.js";
import {
  defineTask,
  promptOf,
  providerFor,
} from "../../../services/ai/task.js";

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    isLikelyRealSpeech: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["isLikelyRealSpeech", "reason"],
  additionalProperties: false,
} as const;

const DEFAULT_SYSTEM_PROMPT =
  'Bạn nhận một đoạn transcript được một model speech-to-text (Whisper) trích ra từ audio track của video, kèm theo một số khung hình thật lấy từ chính video đó để bạn đối chiếu bối cảnh. Whisper đôi khi "hallucinate" (bịa ra chữ nghe NGỮ PHÁP vẫn hợp lý) khi audio không có lời thoại thật (chỉ nhạc nền, hiệu ứng âm thanh, im lặng...) — vì vậy chỉ xét bản thân câu chữ có hợp lý ngữ pháp hay không là KHÔNG ĐỦ để kết luận, hallucination của Whisper vẫn có thể là câu đúng ngữ pháp. Hãy đối chiếu transcript với các khung hình: ngôn ngữ/nội dung của transcript có khớp với bối cảnh, chữ overlay, nhân vật trong khung hình không? Nếu khung hình cho thấy đây là video không lời (chỉ có chữ overlay, nhân vật hoạt hình im lặng, b-roll...), hoặc ngôn ngữ transcript khác hẳn ngôn ngữ xuất hiện trong khung hình mà không có lý do hợp lý, hãy coi đó là dấu hiệu hallucination mạnh. Chỉ trả lời isLikelyRealSpeech=true khi có cơ sở tương đối chắc chắn đây là lời thoại thật khớp với video.';

export interface TranscriptVerification {
  isLikelyRealSpeech: boolean;
  reason: string;
}

export interface VerifyTranscriptInput {
  scriptText: string;
  frames: string[];
  /** Default OpenAI (GPT-4.1); the user's pick (e.g. Claude) when its key is set. */
  provider?: ProviderKey;
  model?: string;
}

export const verifyTranscriptTask = defineTask<
  VerifyTranscriptInput,
  TranscriptVerification
>({
  key: "script.verifyTranscript",
  module: "script",
  group: "upload",
  label: {
    en: "Check transcript is real speech",
    vi: "Kiểm tra transcript là lời thoại thật",
  },
  description: {
    en: "Cross-checks a Whisper transcript against video frames to catch hallucinated text on videos without real dialogue. Runs on the AI picked for the video (Claude or OpenAI).",
    vi: 'Đối chiếu transcript của Whisper với khung hình video để phát hiện chữ bị "bịa" khi video không có lời thoại thật. Chạy bằng AI bạn chọn cho video (Claude hoặc OpenAI).',
  },
  prompts: [
    {
      key: "system",
      label: { en: "Instructions", vi: "Hướng dẫn" },
      default: DEFAULT_SYSTEM_PROMPT,
    },
  ],

  async run(input, ctx) {
    const provider = input.provider ?? "openai";
    const result = await providerFor(
      ctx,
      provider,
    ).generateStructured<TranscriptVerification>({
      model:
        input.model ??
        (provider === "openai" ? GPT_4_1_MODEL : defaultModelFor(provider)),
      system: promptOf(ctx, this, "system"),
      text: input.scriptText,
      images: input.frames,
      schema: VERIFY_SCHEMA,
      schemaName: "transcript_verification",
    });
    return result ?? { isLikelyRealSpeech: true, reason: "" };
  },
});
