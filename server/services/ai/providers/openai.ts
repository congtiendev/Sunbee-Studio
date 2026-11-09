import OpenAI from "openai";
import type {
  AiRequest,
  AiStructuredRequest,
  AiWebSearchResult,
  LlmProvider,
  WebSearchSource,
} from "./types.js";

// gpt-4.1 isn't a reasoning model and rejects reasoning_effort outright, so
// only the gpt-5.6-* family gets it sent.
const REASONING_MODEL_PREFIX = "gpt-5.6-";

type OpenAiEffort = "low" | "medium" | "high";

function toOpenAiEffort(effort: AiRequest["effort"]): OpenAiEffort {
  if (effort === "xhigh" || effort === "max") return "high";
  return effort ?? "medium";
}

function buildUserContent(req: AiRequest) {
  const images = req.images ?? [];
  if (images.length === 0) return req.text;
  const textPart = { type: "text" as const, text: req.text };
  const imageParts = images.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));
  return req.imagesFirst ? [...imageParts, textPart] : [textPart, ...imageParts];
}

export function createOpenAiProvider(apiKey: string): LlmProvider {
  const client = new OpenAI({ apiKey });

  return {
    key: "openai",
    capabilities: { vision: true, webSearch: true },

    async generateText(req) {
      const response = await client.chat.completions.create({
        model: req.model,
        ...(req.model.startsWith(REASONING_MODEL_PREFIX)
          ? { reasoning_effort: toOpenAiEffort(req.effort) }
          : {}),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: buildUserContent(req) },
        ],
      });
      return response.choices[0]?.message?.content?.trim() ?? "";
    },

    async generateStructured<T>(req: AiStructuredRequest): Promise<T | null> {
      const response = await client.chat.completions.create({
        model: req.model,
        ...(req.model.startsWith(REASONING_MODEL_PREFIX)
          ? { reasoning_effort: toOpenAiEffort(req.effort) }
          : {}),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: buildUserContent(req) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, schema: req.schema, strict: true },
        },
      });
      const raw = response.choices[0]?.message?.content;
      return raw ? (JSON.parse(raw) as T) : null;
    },

    async webSearch(req): Promise<AiWebSearchResult> {
      const response = await client.responses.create({
        model: req.model,
        instructions: req.system,
        input: req.text,
        tools: [{ type: "web_search" }],
      });

      const sources: WebSearchSource[] = [];
      for (const item of response.output) {
        if (item.type !== "message") continue;
        for (const part of item.content) {
          if (part.type !== "output_text") continue;
          for (const annotation of part.annotations) {
            if (annotation.type === "url_citation") {
              sources.push({ title: annotation.title, url: annotation.url });
            }
          }
        }
      }
      return { text: response.output_text.trim(), sources: dedupeSources(sources) };
    },
  };
}

export function dedupeSources(sources: WebSearchSource[]): WebSearchSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
