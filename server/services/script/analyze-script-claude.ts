import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { CLAUDE_SONNET_MODEL } from "../../../shared/script-cost-estimate.js";
import type { ScriptAnalyzeResult, StyleTemplate } from "../../../shared/types.js";
import { SCRIPT_ANALYSIS_SCHEMA, buildSystemPrompt } from "./script-analysis-shared.js";

const FRAME_DATA_URL_PREFIX = /^data:image\/jpeg;base64,/;

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export async function analyzeScriptWithClaude(
  scriptText: string,
  apiKey: string,
  styleTemplate?: StyleTemplate,
  frames: string[] = [],
  model: string = CLAUDE_SONNET_MODEL,
  effort: AnthropicEffort = "medium",
): Promise<ScriptAnalyzeResult> {
  const client = new Anthropic({ apiKey });

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: scriptText },
    ...frames.map(
      (frame): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frame.replace(FRAME_DATA_URL_PREFIX, ""),
        },
      }),
    ),
  ];

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: buildSystemPrompt(styleTemplate, frames.length > 0),
    messages: [{ role: "user", content }],
    output_config: {
      format: jsonSchemaOutputFormat(SCRIPT_ANALYSIS_SCHEMA),
      effort,
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude từ chối phân tích nội dung này.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude trả về kết quả bị cắt ngắn do quá dài, hãy thử với kịch bản ngắn hơn.");
  }
  if (!response.parsed_output) {
    throw new Error("Claude không trả về nội dung phân tích hợp lệ.");
  }
  return response.parsed_output as ScriptAnalyzeResult;
}
