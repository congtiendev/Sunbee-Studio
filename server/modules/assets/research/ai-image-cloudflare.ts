import { randomUUID } from "node:crypto";
import type { AssetCandidate, ImageAspectRatio } from "../../../../shared/types.js";
import { firstAvailableProvider, runTask } from "../../../services/ai/task.js";
import { saveFile } from "../../../services/storage/files.js";
import type { ResearchSource } from "../../../services/research/types.js";
import { imagePromptTask } from "../tasks/image-prompt.js";

/**
 * AI image generation via Cloudflare Workers AI (FLUX.2 [klein] 4B). The
 * first of what should become several interchangeable "ai image" sources
 * (Pollinations, AI Horde, ...) — each is just a `ResearchSource` like this
 * one, registered next to it in `../../index.ts`. Nothing else has to change
 * to add one: the research sheet, settings key UI and candidate picker all
 * drive off the generic `ResearchSource` shape.
 */

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
/** Keep a search affordable: a handful of variations, not a full page. */
const MAX_VARIATIONS = 6;

/** width x height per ratio — 720p-ish, matching this app's own video frame shapes. */
const DIMENSIONS: Record<ImageAspectRatio, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
};

interface CloudflareAiResponse {
  success: boolean;
  result?: { image?: string };
  errors?: { message: string }[];
}

/** The settings UI stores one string per source — pack both Cloudflare credentials into it. */
function parseKey(apiKey: string): { accountId: string; token: string } {
  const i = apiKey.indexOf(":");
  if (i <= 0 || i === apiKey.length - 1) {
    throw new Error("Key Cloudflare phải có dạng accountId:apiToken (xem gợi ý bên dưới ô nhập).");
  }
  return { accountId: apiKey.slice(0, i).trim(), token: apiKey.slice(i + 1).trim() };
}

async function generateOne(
  accountId: string,
  token: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<Buffer> {
  const { width, height } = DIMENSIONS[aspectRatio];
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const body = (await res.json().catch(() => null)) as CloudflareAiResponse | null;
  if (!res.ok || !body?.success || !body.result?.image) {
    const message = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Cloudflare Workers AI lỗi: ${message}`);
  }
  return Buffer.from(body.result.image, "base64");
}

export const aiImageCloudflareSource: ResearchSource = {
  key: "cloudflare-image",
  label: "Cloudflare Workers AI",
  kind: "ai",
  mediaTypes: ["image"],
  requiresKey: true,
  generates: true,
  keyUrl: "https://dash.cloudflare.com/profile/api-tokens",

  async validateKey(apiKey) {
    try {
      const { accountId, token } = parseKey(apiKey);
      await generateOne(accountId, token, "a single red dot, test image", "square");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  async search({ query, perPage }, { apiKey, userId, ai, sceneContext, referenceImage, aspectRatio, graphicsStyle }) {
    if (!apiKey) throw new Error("Chưa thiết lập Cloudflare API key.");
    const { accountId, token } = parseKey(apiKey);
    const description = query.trim();
    if (!description) throw new Error("Vui lòng nhập mô tả ảnh cần tạo.");

    // FLUX only understands English well — a Vietnamese prompt comes back as
    // near-random imagery, not an error, so this is silent without a rewrite.
    // A reference image (style only, never its subject) also gets folded in
    // here, and so does the variation count when the description asks for
    // one (e.g. "tạo 3 ảnh...") — without AI to read that, just one image.
    const provider = firstAvailableProvider(ai);
    const { prompt, count: requestedCount } = provider
      ? await runTask(imagePromptTask, { description, sceneContext, referenceImage, graphicsStyle, provider }, ai)
      : { prompt: description, count: 1 };
    const count = Math.max(1, Math.min(perPage ?? requestedCount, MAX_VARIATIONS));

    const attempts = await Promise.allSettled(
      Array.from({ length: count }, () => generateOne(accountId, token, prompt, aspectRatio ?? "square")),
    );
    const images = attempts.filter(
      (a): a is PromiseFulfilledResult<Buffer> => a.status === "fulfilled",
    );
    if (images.length === 0) {
      const firstError = attempts.find(
        (a): a is PromiseRejectedResult => a.status === "rejected",
      );
      throw firstError?.reason instanceof Error
        ? firstError.reason
        : new Error("Không tạo được ảnh nào.");
    }

    const candidates: AssetCandidate[] = await Promise.all(
      images.map(async ({ value: buffer }) => {
        const stored = await saveFile(userId, "asset", buffer, `ai-${randomUUID()}.png`, "image/png");
        const url = `/api/files/${stored.id}`;
        return {
          sourceKey: "cloudflare-image",
          externalId: stored.id,
          mediaType: "image",
          title: prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt,
          previewUrl: url,
          url,
          attribution: "FLUX.2 [klein] qua Cloudflare Workers AI",
        };
      }),
    );
    return { candidates };
  },
};
