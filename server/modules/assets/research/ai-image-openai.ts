import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { AssetCandidate, ImageAspectRatio } from "../../../../shared/types.js";
import { MissingApiKeyError, firstAvailableProvider, hasProviderKey, runTask } from "../../../services/ai/task.js";
import { saveFile } from "../../../services/storage/files.js";
import type { ResearchSource } from "../../../services/research/types.js";
import { imagePromptTask } from "../tasks/image-prompt.js";

/**
 * AI image generation via OpenAI (gpt-image-1.5) — reuses the OpenAI key
 * already set in Settings → API Keys, no key of its own. Unlike Cloudflare's
 * FLUX, this model can output a real transparent background (alpha PNG),
 * so "xoá nền" requests actually get one here.
 */

// "gpt-image-1" was retired; OpenAI's successor is "gpt-image-1.5" (confirmed
// working, including real alpha transparency — checked pixel-by-pixel).
const MODEL = "gpt-image-1.5";
const MAX_VARIATIONS = 6;

const SIZE: Record<ImageAspectRatio, "1024x1024" | "1024x1536" | "1536x1024"> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

export const aiImageOpenAiSource: ResearchSource = {
  key: "openai-image",
  label: "ChatGPT (gpt-image-1.5)",
  kind: "ai",
  mediaTypes: ["image"],
  requiresKey: false,
  generates: true,

  isAvailable: ({ ai }) => hasProviderKey(ai, "openai"),

  async search({ query, perPage }, { userId, ai, sceneContext, referenceImage, aspectRatio }) {
    if (!ai.keys.openai) throw new MissingApiKeyError("openai");
    const description = query.trim();
    if (!description) throw new Error("Vui lòng nhập mô tả ảnh cần tạo.");
    const count = Math.max(1, Math.min(perPage ?? 1, MAX_VARIATIONS));

    // gpt-image-1.5 understands Vietnamese prompts fine, but the same rewrite
    // step also folds in the style reference and lets "tạo 3 ảnh..." set
    // count, so it's worth running here too.
    const provider = firstAvailableProvider(ai, "openai");
    const { prompt, count: requestedCount } = provider
      ? await runTask(imagePromptTask, { description, sceneContext, referenceImage, provider }, ai)
      : { prompt: description, count };
    const n = Math.max(1, Math.min(perPage ?? requestedCount, MAX_VARIATIONS));

    const client = new OpenAI({ apiKey: ai.keys.openai });
    const response = await client.images.generate({
      model: MODEL,
      prompt,
      n,
      size: SIZE[aspectRatio ?? "square"],
      quality: "medium",
      background: "transparent",
      output_format: "png",
    });

    const images = (response.data ?? []).filter((img) => img.b64_json);
    if (images.length === 0) throw new Error("OpenAI không trả về ảnh nào.");

    const candidates: AssetCandidate[] = await Promise.all(
      images.map(async (img) => {
        const buffer = Buffer.from(img.b64_json!, "base64");
        const stored = await saveFile(userId, "asset", buffer, `ai-${randomUUID()}.png`, "image/png");
        const url = `/api/files/${stored.id}`;
        return {
          sourceKey: "openai-image",
          externalId: stored.id,
          mediaType: "image",
          title: prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt,
          previewUrl: url,
          url,
          attribution: "gpt-image-1.5 qua OpenAI (nền trong suốt)",
        };
      }),
    );
    return { candidates };
  },
};
