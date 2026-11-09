import type { AssetCandidate } from "../../../../shared/types.js";
import { hasProviderKey, runTask } from "../../../services/ai/task.js";
import type { ResearchSource } from "../../../services/research/types.js";
import { findImagesTask } from "../tasks/find-images.js";

/**
 * Finds real, already-published images on the web (Claude web_search +
 * web_fetch) — unlike the other "ai" image sources here, this one doesn't
 * generate anything: candidates are hotlinked from wherever they were found,
 * same as the stock sources.
 */
export const aiImageSearchClaudeSource: ResearchSource = {
  key: "claude-image-search",
  label: "Claude (tìm ảnh trên web)",
  kind: "ai",
  mediaTypes: ["image"],
  requiresKey: false,

  isAvailable: ({ ai }) => hasProviderKey(ai, "claude"),

  async search({ query }, { ai, sceneContext }) {
    const description = query.trim();
    if (!description) throw new Error("Vui lòng nhập mô tả ảnh cần tìm.");
    if (!hasProviderKey(ai, "claude")) throw new Error("Cần thiết lập Anthropic API key.");

    const images = await runTask(findImagesTask, { description, sceneContext }, ai);
    if (images.length === 0) throw new Error("Không tìm được ảnh phù hợp trên web.");

    const candidates: AssetCandidate[] = images.map((img) => ({
      sourceKey: "claude-image-search",
      externalId: img.url,
      mediaType: "image",
      title: img.title || description,
      previewUrl: img.url,
      url: img.url,
      pageUrl: img.pageUrl,
      attribution: "Tìm bởi Claude — ảnh thuộc về nguồn gốc trên trang, kiểm tra bản quyền trước khi dùng.",
    }));
    return { candidates };
  },
};
