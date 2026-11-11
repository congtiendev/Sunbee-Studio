import { Router } from "express";
import multer from "multer";
import type {
  AssetCandidate,
  AssetPromptBatchRequest,
  AssetQuerySuggestRequest,
  AssetResearchRequest,
  LibraryMediaType,
  SceneResourceSelectRequest,
  User,
} from "../../../shared/types.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  firstAvailableProvider,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../services/ai/task.js";
import { canAccessVideo } from "../../services/db/videos-repo.js";
import { findResearchSource, listResearchSources } from "../../services/research/registry.js";
import { deleteFile, getFileForUser, saveFile } from "../../services/storage/files.js";
import { getSettings } from "../../settings-store.js";
import {
  createLibraryAsset,
  deleteLibraryAsset,
  getLibraryAsset,
  listSceneResources,
  searchLibrary,
  setSceneResource,
  updateLibraryAsset,
} from "./repo.js";
import { imagePromptTask } from "./tasks/image-prompt.js";
import { searchQueryTask } from "./tasks/search-query.js";

const router = Router();

const MAX_ASSET_BYTES = 200 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ASSET_BYTES } });

const isAdmin = (user: User) => user.role === "admin";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Multer decodes multipart filenames as latin1; browsers send UTF-8. */
function decodeFilename(name: string): string {
  const decoded = Buffer.from(name, "latin1").toString("utf-8");
  return decoded.includes("�") ? name : decoded;
}

function mediaTypeOf(mime: string): LibraryMediaType | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function splitTags(value: unknown): string[] {
  const list: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return list
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// ---------- research ----------

router.get("/sources", requireAuth, (req, res) => {
  res.json(listResearchSources(req.user!.id));
});

/** English stock keywords for a required asset (AI when a key is set, else the description). */
router.post("/suggest-queries", requireAuth, async (req, res) => {
  const body = req.body as AssetQuerySuggestRequest;
  const description = body.description?.trim() ?? "";
  if (!description) {
    res.status(400).json({ error: "Thiếu mô tả tài nguyên." });
    return;
  }
  const ctx = taskContextFor(req.user!.id);
  const provider = firstAvailableProvider(ctx);
  if (!provider) {
    res.json({ queries: [description], aiUsed: false });
    return;
  }
  try {
    const queries = await runTask(
      searchQueryTask,
      { description, sceneContext: body.sceneContext, mediaType: body.mediaType, provider },
      ctx,
    );
    res.json(queries.length ? { queries, aiUsed: true } : { queries: [description], aiUsed: false });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post("/research", requireAuth, async (req, res) => {
  const body = req.body as AssetResearchRequest;
  const source = findResearchSource(body.sourceKey);
  if (!source) {
    res.status(404).json({ error: "Không có nguồn research này." });
    return;
  }
  const query = body.query?.trim() ?? "";
  // An empty library query lists the newest items; every other source needs keywords.
  if (!query && source.kind !== "library") {
    res.status(400).json({ error: "Vui lòng nhập từ khoá." });
    return;
  }
  const apiKey = getSettings(req.user!.id).researchApiKeys?.[source.key];
  if (source.requiresKey && !apiKey) {
    res.status(400).json({ error: `Chưa thiết lập API key cho ${source.label}. Vào Settings → API Keys.` });
    return;
  }
  try {
    res.json(
      await source.search(
        { query, mediaType: body.mediaType },
        {
          userId: req.user!.id,
          isAdmin: isAdmin(req.user!),
          apiKey,
          ai: taskContextFor(req.user!.id),
          description: body.description,
          sceneContext: body.sceneContext,
          referenceImages: body.referenceImages,
          aspectRatio: body.aspectRatio,
          graphicsStyle: body.graphicsStyle,
        },
      ),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/**
 * Ready-to-paste prompts for many required assets at once, for a skill
 * attached directly in an external AI chat — deliberately no graphicsStyle or
 * referenceImages (the attached skill covers style), and never generates an
 * image, only rewrites prompt text. Per-character reference photos (if the
 * roster has any) are the one exception: the external tool has no way to
 * know which specific person that is, so their look is described in anyway.
 * One sequential call per item: modest batch sizes, not a hot path, and
 * keeps this simple.
 */
router.post("/image-prompts", requireAuth, async (req, res) => {
  const body = req.body as AssetPromptBatchRequest;
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: "Thiếu danh sách tài nguyên cần tạo prompt." });
    return;
  }
  const ctx = taskContextFor(req.user!.id);
  const provider = body.provider ?? "claude";
  if (!hasProviderKey(ctx, provider)) {
    res.status(400).json({ error: `Chưa thiết lập API key cho ${provider}.` });
    return;
  }
  try {
    const results = [];
    for (const item of items) {
      const output = await runTask(
        imagePromptTask,
        {
          description: item.description,
          sceneContext: item.sceneContext,
          characterReferenceImages: item.characterImages,
          provider,
        },
        ctx,
      );
      results.push({ key: item.key, prompt: output.prompt, count: output.count });
    }
    res.json({ results });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

// ---------- picks per scene ----------

router.get("/selections", requireAuth, (req, res) => {
  const videoId = req.query.videoId as string;
  if (!videoId || !canAccessVideo(req.user!.id, isAdmin(req.user!), videoId)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  res.json(listSceneResources(videoId));
});

router.put("/selections", requireAuth, (req, res) => {
  const body = req.body as SceneResourceSelectRequest;
  if (!body.videoId || !canAccessVideo(req.user!.id, isAdmin(req.user!), body.videoId)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  if (!Number.isInteger(body.sceneIndex) || !Number.isInteger(body.assetIndex)) {
    res.status(400).json({ error: "Thiếu vị trí cảnh/tài nguyên." });
    return;
  }
  res.json(setSceneResource(req.user!.id, body));
});

// ---------- internal library ----------

router.get("/library", requireAuth, (req, res) => {
  const type = req.query.type as string | undefined;
  res.json(
    searchLibrary(req.user!.id, isAdmin(req.user!), {
      query: (req.query.q as string | undefined) ?? "",
      mediaType: type === "image" || type === "video" || type === "audio" ? type : undefined,
      limit: 500,
    }),
  );
});

router.post(
  "/library",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: `File quá lớn. Giới hạn ${MAX_ASSET_BYTES / 1024 / 1024}MB.` });
        return;
      }
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file." });
      return;
    }
    const mediaType = mediaTypeOf(req.file.mimetype);
    if (!mediaType) {
      res.status(400).json({ error: "Chỉ hỗ trợ ảnh, video hoặc âm thanh." });
      return;
    }
    try {
      const filename = decodeFilename(req.file.originalname);
      const body = req.body as { name?: string; tags?: string; description?: string };
      const stored = await saveFile(req.user!.id, "asset", req.file.buffer, filename, req.file.mimetype);
      const id = createLibraryAsset(req.user!.id, {
        fileId: stored.id,
        mediaType,
        name: body.name?.trim() || filename.replace(/\.[^.]+$/, ""),
        tags: splitTags(body.tags),
        description: body.description?.trim() ?? "",
      });
      res.json(getLibraryAsset(req.user!.id, isAdmin(req.user!), id));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

/**
 * Keeps a research candidate permanently — an AI-generated image, or any
 * other source's pick. Local candidates (already under `/api/files/`, e.g.
 * this module's own AI image sources) just get a library row; anything
 * external is downloaded once and stored the same way uploads are.
 */
router.post("/library/from-candidate", requireAuth, async (req, res) => {
  const body = req.body as {
    candidate?: AssetCandidate;
    name?: string;
    tags?: string;
    description?: string;
  };
  const candidate = body.candidate;
  if (!candidate?.url) {
    res.status(400).json({ error: "Thiếu candidate." });
    return;
  }
  if (candidate.mediaType !== "image" && candidate.mediaType !== "video" && candidate.mediaType !== "audio") {
    res.status(400).json({ error: "Chỉ lưu được ảnh, video hoặc âm thanh vào thư viện." });
    return;
  }
  try {
    const localMatch = /^\/api\/files\/([^/?#]+)$/.exec(candidate.url);
    const fileId = localMatch
      ? (() => {
          const existing = getFileForUser(req.user!.id, isAdmin(req.user!), localMatch[1]!);
          if (!existing) throw new Error("Không tìm thấy file.");
          return existing.id;
        })()
      : await (async () => {
          const downloaded = await fetch(candidate.url);
          if (!downloaded.ok) throw new Error(`Không tải được file (HTTP ${downloaded.status}).`);
          const buffer = Buffer.from(await downloaded.arrayBuffer());
          const mime = downloaded.headers.get("content-type") ?? "application/octet-stream";
          const stored = await saveFile(req.user!.id, "asset", buffer, candidate.title || "asset", mime);
          return stored.id;
        })();
    const id = createLibraryAsset(req.user!.id, {
      fileId,
      mediaType: candidate.mediaType,
      name: body.name?.trim() || candidate.title || "Asset",
      tags: splitTags(body.tags),
      description: body.description?.trim() ?? candidate.description ?? "",
    });
    res.json(getLibraryAsset(req.user!.id, isAdmin(req.user!), id));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.patch("/library/:id", requireAuth, (req, res) => {
  const body = req.body as { name?: string; tags?: string[] | string; description?: string };
  if (body.name !== undefined && !body.name.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tên." });
    return;
  }
  const updated = updateLibraryAsset(req.user!.id, isAdmin(req.user!), req.params.id as string, {
    name: body.name?.trim(),
    tags: body.tags === undefined ? undefined : splitTags(body.tags),
    description: body.description?.trim(),
  });
  if (!updated) {
    res.status(404).json({ error: "Không tìm thấy tài nguyên." });
    return;
  }
  res.json(updated);
});

router.delete("/library/:id", requireAuth, async (req, res) => {
  const fileId = deleteLibraryAsset(req.user!.id, isAdmin(req.user!), req.params.id as string);
  if (fileId) await deleteFile(req.user!.id, isAdmin(req.user!), fileId);
  res.json({ ok: true });
});

export default router;
