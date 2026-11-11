import { Router } from "express";
import multer from "multer";
import type {
  AssetCandidate,
  AssetPromptBatchRequest,
  AssetQuerySuggestRequest,
  AssetResearchRequest,
  AssetSplitLayersRequest,
  AssetSplitLayersResponse,
  RequiredAsset,
  SceneShot,
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
  clearSceneResources,
  listAssetPrompts,
  listSceneResources,
  saveAssetPrompt,
  searchLibrary,
  setSceneResource,
  updateLibraryAsset,
} from "./repo.js";
import { IMAGE_PROMPT_RULES_VERSION, imagePromptTask } from "./tasks/image-prompt.js";
import { searchQueryTask } from "./tasks/search-query.js";
import { splitLayersTask } from "./tasks/split-layers.js";
import { approveScriptVersion } from "../script/service.js";
import { getScriptAnalysisById } from "../script/repo.js";
import { getTemplateById } from "../../services/db/style-templates-repo.js";

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
          frameRatio: body.frameRatio,
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
  // Prompts for a video are saved one by one as they're written, so a batch
  // cut short (error, closed tab) keeps everything done so far.
  const videoId = body.videoId;
  if (videoId && !canAccessVideo(req.user!.id, isAdmin(req.user!), videoId)) {
    res.status(404).json({ error: "Không tìm thấy video." });
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
          frameRatio: body.frameRatio,
          layer: item.layer,
          placement: item.placement,
          shot: item.shot,
          styleFromSkill: true,
          provider,
        },
        ctx,
      );
      if (videoId && output.prompt.trim()) {
        saveAssetPrompt(req.user!.id, {
          videoId,
          description: item.description,
          prompt: output.prompt,
          frameRatio: body.frameRatio,
          layer: output.layer,
          rulesVersion: IMAGE_PROMPT_RULES_VERSION,
        });
      }
      results.push({ key: item.key, prompt: output.prompt, count: output.count, layer: output.layer });
    }
    res.json({ results });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Scenes per AI call when planning shots & layers — each scene's answer is long (shots + images per shot). */
const SPLIT_SCENES_PER_CALL = 4;

/**
 * Splits the moving subjects of a scene range into layers (a background frame
 * plus one transparent cutout per visual state) on an existing analysis, and
 * saves the result as a new approved version. Picks of scenes whose asset
 * list changed are cleared, since their positions now mean other assets.
 */
router.post("/split-layers", requireAuth, async (req, res) => {
  const body = req.body as AssetSplitLayersRequest;
  const admin = isAdmin(req.user!);
  if (!body.videoId || !canAccessVideo(req.user!.id, admin, body.videoId)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  const base = getScriptAnalysisById(req.user!.id, admin, body.versionId);
  if (!base || base.videoId !== body.videoId || base.kind !== "analyzed") {
    res.status(404).json({ error: "Không tìm thấy bản phân tích của video này." });
    return;
  }
  const ctx = taskContextFor(req.user!.id);
  const provider = firstAvailableProvider(ctx);
  if (!provider) {
    res.status(400).json({ error: "Chưa thiết lập API key AI (Claude hoặc OpenAI)." });
    return;
  }
  const inRange = base.scenes.filter(
    (scene) => scene.index >= body.fromScene && scene.index <= body.toScene,
  );
  if (inRange.length === 0) {
    res.status(400).json({ error: "Không có cảnh nào trong khoảng đã chọn." });
    return;
  }
  const rosterNames = [
    ...(base.characterRoster ?? []).map((c) => c.name),
    ...(base.objectRoster ?? []).map((o) => o.name),
  ];
  try {
    // The video's editing skill shapes how scenes are broken into shots.
    const editingStyle = base.editingStyleTemplateId
      ? getTemplateById(req.user!.id, admin, base.editingStyleTemplateId)?.editingStyle
      : undefined;
    const rewritten = new Map<number, { shots: SceneShot[]; requiredAssets: RequiredAsset[] }>();
    for (let i = 0; i < inRange.length; i += SPLIT_SCENES_PER_CALL) {
      const batch = inRange.slice(i, i + SPLIT_SCENES_PER_CALL);
      // The scene before the batch — already re-planned in this run when there is one.
      const before = base.scenes.find((scene) => scene.index === batch[0]!.index - 1);
      const previousScene =
        before && rewritten.has(before.index) ? { ...before, ...rewritten.get(before.index)! } : before;
      const output = await runTask(
        splitLayersTask,
        { scenes: batch, rosterNames, editingStyle, previousScene, provider },
        ctx,
      );
      for (const scene of output.scenes) {
        if (batch.some((s) => s.index === scene.index)) {
          rewritten.set(scene.index, { shots: scene.shots, requiredAssets: scene.requiredAssets });
        }
      }
    }
    const changedScenes: number[] = [];
    const scenes = base.scenes.map((scene) => {
      const plan = rewritten.get(scene.index);
      if (
        !plan ||
        (JSON.stringify(plan.requiredAssets) === JSON.stringify(scene.requiredAssets) &&
          JSON.stringify(plan.shots) === JSON.stringify(scene.shots ?? []))
      ) {
        return scene;
      }
      changedScenes.push(scene.index);
      return { ...scene, shots: plan.shots, requiredAssets: plan.requiredAssets };
    });
    const version =
      changedScenes.length > 0
        ? approveScriptVersion(req.user!, {
            versionId: base.id,
            scenes,
            resources: base.resources,
            style: base.style ?? { genre: "", styleTags: [], toneDescription: "" },
          })
        : base;
    clearSceneResources(body.videoId, changedScenes);
    const response: AssetSplitLayersResponse = { version, changedScenes };
    res.json(response);
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** The prompts already written for a video's required assets. */
router.get("/image-prompts", requireAuth, (req, res) => {
  const videoId = req.query.videoId as string;
  if (!videoId || !canAccessVideo(req.user!.id, isAdmin(req.user!), videoId)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  res.json(listAssetPrompts(videoId, IMAGE_PROMPT_RULES_VERSION));
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
