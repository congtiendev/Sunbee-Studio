import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { dedupeSources } from "./openai.js";
import type {
  AiRequest,
  AiStructuredRequest,
  AiWebSearchResult,
  LlmProvider,
  WebSearchSource,
} from "./types.js";

const FRAME_DATA_URL_PREFIX = /^data:image\/\w+;base64,/;
const DEFAULT_STRUCTURED_MAX_TOKENS = 16000;
const DEFAULT_TEXT_MAX_TOKENS = 4000;
// A long web search can pause mid-turn; resume it at most this many times.
const MAX_WEB_SEARCH_CONTINUATIONS = 3;

type JsonSchemaParam = Parameters<typeof jsonSchemaOutputFormat>[0];

function mediaTypeOf(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,/.exec(dataUrl);
  return (match?.[1] as "image/png" | undefined) ?? "image/jpeg";
}

function buildContent(req: AiRequest): Anthropic.ContentBlockParam[] {
  const textBlock: Anthropic.TextBlockParam = { type: "text", text: req.text };
  const imageBlocks = (req.images ?? []).map(
    (image): Anthropic.ImageBlockParam => ({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaTypeOf(image),
        data: image.replace(FRAME_DATA_URL_PREFIX, ""),
      },
    }),
  );
  return req.imagesFirst ? [...imageBlocks, textBlock] : [textBlock, ...imageBlocks];
}

function firstText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

export function createAnthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey });

  return {
    key: "claude",
    capabilities: { vision: true, webSearch: true },

    async generateText(req) {
      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_TEXT_MAX_TOKENS,
        system: req.system,
        messages: [{ role: "user", content: buildContent(req) }],
        ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      });
      return firstText(response.content);
    },

    async generateStructured<T>(req: AiStructuredRequest): Promise<T | null> {
      const response = await client.messages.parse({
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS,
        system: req.system,
        messages: [{ role: "user", content: buildContent(req) }],
        output_config: {
          format: jsonSchemaOutputFormat(req.schema as unknown as JsonSchemaParam),
          effort: req.effort ?? "medium",
        },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude từ chối xử lý nội dung này.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          "Claude trả về kết quả bị cắt ngắn do quá dài, hãy thử với nội dung ngắn hơn.",
        );
      }
      return (response.parsed_output as T | null | undefined) ?? null;
    },

    async webSearch(req): Promise<AiWebSearchResult> {
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: buildContent(req) },
      ];
      const texts: string[] = [];
      const sources: WebSearchSource[] = [];

      for (let turn = 0; turn <= MAX_WEB_SEARCH_CONTINUATIONS; turn++) {
        const response = await client.messages.create({
          model: req.model,
          max_tokens: req.maxTokens ?? DEFAULT_TEXT_MAX_TOKENS,
          system: req.system,
          messages,
          tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 5 }],
        });

        for (const block of response.content) {
          if (block.type === "text") {
            texts.push(block.text);
            for (const citation of block.citations ?? []) {
              if (citation.type === "web_search_result_location") {
                sources.push({ title: citation.title ?? citation.url, url: citation.url });
              }
            }
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const result of block.content) {
              sources.push({ title: result.title, url: result.url });
            }
          }
        }

        if (response.stop_reason !== "pause_turn") break;
        // Hand the paused turn back so the server-side search can continue.
        messages.push({ role: "assistant", content: response.content });
      }

      return { text: texts.join("").trim(), sources: dedupeSources(sources) };
    },
  };
}
