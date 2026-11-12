import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { dedupeSources } from "./openai.js";
import type {
  AiRequest,
  AiStructuredRequest,
  AiWebSearchResult,
  FoundImage,
  LlmProvider,
  WebSearchSource,
} from "./types.js";

const FRAME_DATA_URL_PREFIX = /^data:image\/\w+;base64,/;
const DEFAULT_STRUCTURED_MAX_TOKENS = 16000;
const DEFAULT_TEXT_MAX_TOKENS = 4000;
/**
 * The SDK already retries 429/5xx (so 529 overloaded_error too) with backoff
 * on its default of 2 — raised a bit since an overload spike can outlast
 * that, and failing the user's whole batch over a transient 529 is worse
 * than waiting a few extra seconds.
 */
const MAX_RETRIES = 4;

/**
 * Anthropic's own error JSON (`{"type":"error","error":{"type":"overloaded_error",...}}`)
 * is useless shown raw to a user — turn the retryable ones into a plain
 * Vietnamese message; anything else (bad request, auth, refusal...) already
 * carries an actionable `.message` from the SDK, so it passes through as-is.
 */
function friendlyAnthropicError(err: unknown): unknown {
  if (!(err instanceof Anthropic.APIError)) return err;
  if (err.status === 529 || err.type === "overloaded_error") {
    return new Error(
      "Claude đang quá tải (quá nhiều người dùng cùng lúc). Đã tự thử lại nhưng vẫn quá tải — vui lòng đợi một chút rồi thử lại, hoặc đổi sang OpenAI.",
    );
  }
  if (err.status === 429 || err.type === "rate_limit_error") {
    return new Error(
      "Đã vượt giới hạn gọi API của Claude (rate limit). Vui lòng đợi một chút rồi thử lại.",
    );
  }
  if (err.status !== undefined && err.status >= 500) {
    return new Error(
      "Claude đang gặp sự cố tạm thời ở phía máy chủ. Vui lòng thử lại sau.",
    );
  }
  return err;
}

/** Runs an Anthropic SDK call, remapping its retryable errors to a friendly message. */
async function withFriendlyErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw friendlyAnthropicError(err);
  }
}
/**
 * Above this many output tokens a request streams: the SDK refuses long
 * non-streaming requests (they risk HTTP timeouts). Long scripts need it.
 */
const NON_STREAMING_MAX_TOKENS = 16000;
// A long web search can pause mid-turn; resume it at most this many times.
const MAX_WEB_SEARCH_CONTINUATIONS = 3;

type JsonSchemaParam = Parameters<typeof jsonSchemaOutputFormat>[0];

function mediaTypeOf(
  dataUrl: string,
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
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
  return req.imagesFirst
    ? [...imageBlocks, textBlock]
    : [textBlock, ...imageBlocks];
}

/**
 * Never hand back a cut-off result: a script truncated by the output limit would
 * be saved as if complete. Refusals are reported the same way.
 */
function assertComplete(message: Pick<Anthropic.Message, "stop_reason">): void {
  if (message.stop_reason === "refusal") {
    throw new Error("Claude từ chối xử lý nội dung này.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Claude dừng giữa chừng vì kết quả dài hơn giới hạn đầu ra, nên kết quả bị bỏ để không lưu nội dung bị cắt cụt. Hãy thử lại với mức nỗ lực thấp hơn hoặc nội dung ngắn hơn.",
    );
  }
}

function firstText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

export function createAnthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey, maxRetries: MAX_RETRIES });

  return {
    key: "claude",
    capabilities: { vision: true, webSearch: true, imageSearch: true },

    async generateText(req) {
      return withFriendlyErrors(async () => {
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          model: req.model,
          max_tokens: req.maxTokens ?? DEFAULT_TEXT_MAX_TOKENS,
          system: req.system,
          messages: [{ role: "user", content: buildContent(req) }],
          ...(req.effort ? { output_config: { effort: req.effort } } : {}),
        };
        const message =
          params.max_tokens > NON_STREAMING_MAX_TOKENS
            ? await client.messages.stream(params).finalMessage()
            : await client.messages.create(params);
        assertComplete(message);
        return firstText(message.content);
      });
    },

    async generateStructured<T>(req: AiStructuredRequest): Promise<T | null> {
      return withFriendlyErrors(async () => {
        const maxTokens = req.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS;
        const base = {
          model: req.model,
          max_tokens: maxTokens,
          system: req.system,
          messages: [{ role: "user" as const, content: buildContent(req) }],
        };

        if (maxTokens > NON_STREAMING_MAX_TOKENS) {
          // Long structured output (e.g. a whole ~30k-character script with its
          // scenes) must stream; the JSON comes back as the text block.
          const message = await client.messages
            .stream({
              ...base,
              output_config: {
                format: { type: "json_schema", schema: req.schema },
                effort: req.effort ?? "medium",
              },
            })
            .finalMessage();
          assertComplete(message);
          const json = firstText(message.content);
          return json ? (JSON.parse(json) as T) : null;
        }

        const response = await client.messages.parse({
          ...base,
          output_config: {
            format: jsonSchemaOutputFormat(
              req.schema as unknown as JsonSchemaParam,
            ),
            effort: req.effort ?? "medium",
          },
        });
        assertComplete(response);
        return (response.parsed_output as T | null | undefined) ?? null;
      });
    },

    async webSearch(req): Promise<AiWebSearchResult> {
      return withFriendlyErrors(async () => {
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
            tools: [
              { type: "web_search_20260318", name: "web_search", max_uses: 5 },
            ],
          });

          for (const block of response.content) {
            if (block.type === "text") {
              texts.push(block.text);
              for (const citation of block.citations ?? []) {
                if (citation.type === "web_search_result_location") {
                  sources.push({
                    title: citation.title ?? citation.url,
                    url: citation.url,
                  });
                }
              }
            } else if (
              block.type === "web_search_tool_result" &&
              Array.isArray(block.content)
            ) {
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
      });
    },

    async findImages(req): Promise<FoundImage[]> {
      return withFriendlyErrors(async () => {
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: buildContent(req) },
        ];
        const texts: string[] = [];

        for (let turn = 0; turn <= MAX_WEB_SEARCH_CONTINUATIONS; turn++) {
          const response = await client.messages.create({
            model: req.model,
            max_tokens: req.maxTokens ?? DEFAULT_TEXT_MAX_TOKENS,
            system: req.system,
            messages,
            tools: [
              { type: "web_search_20260318", name: "web_search", max_uses: 15 },
              { type: "web_fetch_20260209", name: "web_fetch", max_uses: 15 },
            ],
          });

          for (const block of response.content) {
            if (block.type === "text") texts.push(block.text);
          }

          if (response.stop_reason !== "pause_turn") break;
          messages.push({ role: "assistant", content: response.content });
        }

        const full = texts.join("");
        const match =
          /```json\s*([\s\S]*?)```/.exec(full) ?? /(\[[\s\S]*\])/.exec(full);
        if (!match) return [];
        try {
          const parsed = JSON.parse(match[1]!) as unknown;
          if (!Array.isArray(parsed)) return [];
          return parsed
            .filter(
              (item): item is FoundImage =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as FoundImage).url === "string" &&
                typeof (item as FoundImage).pageUrl === "string" &&
                typeof (item as FoundImage).title === "string",
            )
            .slice(0, 15);
        } catch {
          return [];
        }
      });
    },
  };
}
