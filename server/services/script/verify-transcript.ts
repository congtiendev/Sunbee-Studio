import OpenAI from "openai";
import { GPT_4_1_MODEL } from "../../../shared/script-cost-estimate.js";

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    isLikelyRealSpeech: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["isLikelyRealSpeech", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "Bạn nhận một đoạn transcript được một model speech-to-text (Whisper) trích ra từ audio track của video, kèm theo một số khung hình thật lấy từ chính video đó để bạn đối chiếu bối cảnh. Whisper đôi khi \"hallucinate\" (bịa ra chữ nghe NGỮ PHÁP vẫn hợp lý) khi audio không có lời thoại thật (chỉ nhạc nền, hiệu ứng âm thanh, im lặng...) — vì vậy chỉ xét bản thân câu chữ có hợp lý ngữ pháp hay không là KHÔNG ĐỦ để kết luận, hallucination của Whisper vẫn có thể là câu đúng ngữ pháp. Hãy đối chiếu transcript với các khung hình: ngôn ngữ/nội dung của transcript có khớp với bối cảnh, chữ overlay, nhân vật trong khung hình không? Nếu khung hình cho thấy đây là video không lời (chỉ có chữ overlay, nhân vật hoạt hình im lặng, b-roll...), hoặc ngôn ngữ transcript khác hẳn ngôn ngữ xuất hiện trong khung hình mà không có lý do hợp lý, hãy coi đó là dấu hiệu hallucination mạnh. Chỉ trả lời isLikelyRealSpeech=true khi có cơ sở tương đối chắc chắn đây là lời thoại thật khớp với video.";

export interface TranscriptVerification {
  isLikelyRealSpeech: boolean;
  reason: string;
}

export async function verifyTranscriptIsRealSpeech(
  scriptText: string,
  frames: string[],
  apiKey: string,
): Promise<TranscriptVerification> {
  const client = new OpenAI({ apiKey });

  const userContent =
    frames.length > 0
      ? [
          { type: "text" as const, text: scriptText },
          ...frames.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ]
      : scriptText;

  const response = await client.chat.completions.create({
    model: GPT_4_1_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "transcript_verification",
        schema: VERIFY_SCHEMA,
        strict: true,
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return { isLikelyRealSpeech: true, reason: "" };
  return JSON.parse(raw) as TranscriptVerification;
}
