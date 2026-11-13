import type { FrameRatio } from "./types.js";

/**
 * A video's frame shape — one per video, used by everything that makes its
 * images: the AI prompt writer, the studio's own image generators and the
 * ChatGPT pack. Order is the order the picker shows.
 */
export const FRAME_RATIOS: readonly FrameRatio[] = ["16:9", "9:16", "1:1", "4:3"];

/** A video that never picked one is a regular horizontal video. */
export const DEFAULT_FRAME_RATIO: FrameRatio = "16:9";

export function isFrameRatio(value: unknown): value is FrameRatio {
  return typeof value === "string" && (FRAME_RATIOS as readonly string[]).includes(value);
}

/** How the ratio is spelled to an AI (the prompts are Vietnamese): "16:9 (ngang)". */
export function frameRatioForAi(ratio: FrameRatio): string {
  const shape = { "16:9": "ngang", "9:16": "dọc", "1:1": "vuông", "4:3": "ngang" }[ratio];
  return `${ratio} (${shape})`;
}

/** Cloudflare FLUX takes any size — the exact ratio, ~720p. */
export const FLUX_DIMENSIONS: Record<FrameRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1024, height: 768 },
};

/** gpt-image only offers three sizes, so the closest one (the prompt still composes for the real ratio). */
export const GPT_IMAGE_SIZE: Record<FrameRatio, "1024x1024" | "1024x1536" | "1536x1024"> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
  "4:3": "1536x1024",
};

/** The render step's output resolution — higher than the ~720p image-gen sizes above, since this is the final deliverable. */
export const RENDER_DIMENSIONS: Record<FrameRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
};

export const RENDER_FPS = 30;
