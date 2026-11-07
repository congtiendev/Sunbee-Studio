import OpenAI from "openai";
import { GPT_4_1_MODEL } from "../../../shared/script-cost-estimate.js";
import {
  buildDescribeVideoSystemPrompt,
  type ScriptLanguage,
} from "./describe-video-from-frames.js";

// Used when the user explicitly picks OpenAI for this step, and also as the
// safety-net fallback when no Anthropic key is configured (or the Claude
// call fails) — same job (describe the video from its sampled frames since
// there's no real speech to transcribe), using the OpenAI key this route
// already requires for Whisper, so a detailed script is always producible
// either way.
export async function describeVideoFromFramesOpenAi(
  frames: string[],
  apiKey: string,
  model: string = GPT_4_1_MODEL,
  language: ScriptLanguage = "vi",
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildDescribeVideoSystemPrompt(language) },
      {
        role: "user",
        content: [
          { type: "text", text: "Viết kịch bản mô tả video dựa trên các khung hình sau." },
          ...frames.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
