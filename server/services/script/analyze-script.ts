import OpenAI from "openai";
import { GPT_4_1_MODEL } from "../../../shared/script-cost-estimate.js";
import type { ScriptAnalyzeResult, StyleTemplate } from "../../../shared/types.js";
import { SCRIPT_ANALYSIS_SCHEMA, buildSystemPrompt } from "./script-analysis-shared.js";

export type OpenAiEffort = "low" | "medium" | "high";

// gpt-4.1 isn't a reasoning model and rejects reasoning_effort outright, so
// only the gpt-5.6-* family gets it sent.
const REASONING_MODEL_PREFIX = "gpt-5.6-";

export async function analyzeScript(
  scriptText: string,
  apiKey: string,
  styleTemplate?: StyleTemplate,
  frames: string[] = [],
  model: string = GPT_4_1_MODEL,
  effort: OpenAiEffort = "medium",
): Promise<ScriptAnalyzeResult> {
  const client = new OpenAI({ apiKey });

  const userContent =
    frames.length > 0
      ? [
          { type: "text" as const, text: scriptText },
          ...frames.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "low" as const },
          })),
        ]
      : scriptText;

  const response = await client.chat.completions.create({
    model,
    ...(model.startsWith(REASONING_MODEL_PREFIX) ? { reasoning_effort: effort } : {}),
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(styleTemplate, frames.length > 0),
      },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "script_analysis",
        schema: SCRIPT_ANALYSIS_SCHEMA,
        strict: true,
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI không trả về nội dung phân tích.");
  return JSON.parse(raw) as ScriptAnalyzeResult;
}
