import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { getCategory } from "../services/db/categories-repo.js";
import {
  canAccessVideo,
  createVideo,
  getVideo,
  listProjectVideos,
  listRecentVideos,
  listVideos,
  renameVideo,
  setVideoFrameRatio,
  softDeleteVideo,
  updateVideoPipeline,
  type VideoPipelinePatch,
} from "../services/db/videos-repo.js";
import { getDb } from "../services/db/client.js";
import { getTemplateById } from "../services/db/style-templates-repo.js";
import { getScriptAnalysisById } from "../modules/script/repo.js";
import { isFrameRatio } from "../../shared/frame-ratio.js";
import type { VideoUpdateRequest } from "../../shared/types.js";

const router = Router();

const RECENT_DEFAULT = 8;
const RECENT_MAX = 50;

/** GET /api/videos?categoryId=… or ?projectId=… */
router.get("/", requireAuth, (req, res) => {
  const isAdmin = req.user!.role === "admin";
  const { categoryId, projectId } = req.query;
  if (typeof categoryId === "string" && categoryId) {
    res.json(listVideos(req.user!.id, isAdmin, categoryId));
    return;
  }
  if (typeof projectId === "string" && projectId) {
    res.json(listProjectVideos(req.user!.id, isAdmin, projectId));
    return;
  }
  res.status(400).json({ error: "Thiếu categoryId hoặc projectId." });
});

/** GET /api/videos/recent?limit=… — most recently updated videos across projects. */
router.get("/recent", requireAuth, (req, res) => {
  const requested = Number(req.query.limit);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, RECENT_MAX)
      : RECENT_DEFAULT;
  res.json(listRecentVideos(req.user!.id, req.user!.role === "admin", limit));
});

router.get("/:id", requireAuth, (req, res) => {
  const video = getVideo(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  if (!video) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  res.json(video);
});

router.post("/", requireAuth, (req, res) => {
  const body = req.body as { categoryId?: string; name?: string };
  const name = body.name?.trim();
  if (!body.categoryId || !name) {
    res.status(400).json({ error: "Thiếu categoryId hoặc tên video." });
    return;
  }
  // Only inside a live category the user may work in — not someone else's by id.
  if (!getCategory(req.user!.id, req.user!.role === "admin", body.categoryId)) {
    res.status(404).json({ error: "Không tìm thấy danh mục." });
    return;
  }
  res.json(createVideo(req.user!.id, body.categoryId, name));
});

const STEP_KEYS = new Set(["script", "assets", "editPlan", "render"]);
const MAX_TARGET_DURATION_SEC = 4 * 60 * 60;

/** Why a pipeline field can't be set as given (null = fine), and the patch to apply. */
function pipelinePatch(
  userId: string,
  isAdmin: boolean,
  videoId: string,
  body: Partial<Record<keyof VideoUpdateRequest, unknown>>,
): { error: string } | { patch: VideoPipelinePatch } {
  const patch: VideoPipelinePatch = {};
  if (body.scriptVersionId !== undefined) {
    if (body.scriptVersionId !== null) {
      const version =
        typeof body.scriptVersionId === "string"
          ? getScriptAnalysisById(userId, isAdmin, body.scriptVersionId)
          : null;
      if (!version || version.videoId !== videoId || version.kind !== "analyzed") {
        return { error: "Phiên bản kịch bản không thuộc video này hoặc chưa được phân tích." };
      }
    }
    patch.scriptVersionId = body.scriptVersionId as string | null;
  }
  if (body.targetDurationSec !== undefined) {
    const value = body.targetDurationSec;
    if (value !== null && !(Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_TARGET_DURATION_SEC)) {
      return { error: "Thời lượng mục tiêu không hợp lệ." };
    }
    patch.targetDurationSec = value as number | null;
  }
  if (body.voiceProfileId !== undefined) {
    if (body.voiceProfileId !== null) {
      const exists =
        typeof body.voiceProfileId === "string" &&
        getDb()
          .prepare(`SELECT 1 FROM voice_profiles WHERE id = ? ${isAdmin ? "" : "AND user_id = ?"}`)
          .get(...[body.voiceProfileId, ...(isAdmin ? [] : [userId])]);
      if (!exists) return { error: "Không tìm thấy giọng đọc này." };
    }
    patch.voiceProfileId = body.voiceProfileId as string | null;
  }
  if (body.graphicsSkillId !== undefined) {
    // "" = deliberately no graphics skill; null = back to the user's default.
    if (body.graphicsSkillId !== null && body.graphicsSkillId !== "") {
      const skill =
        typeof body.graphicsSkillId === "string"
          ? getTemplateById(userId, isAdmin, body.graphicsSkillId)
          : null;
      if (!skill || skill.type !== "image") return { error: "Không tìm thấy skill đồ hoạ này." };
    }
    patch.graphicsSkillId = body.graphicsSkillId as string | null;
  }
  if (body.editSkillId !== undefined) {
    if (body.editSkillId !== null) {
      const skill =
        typeof body.editSkillId === "string" ? getTemplateById(userId, isAdmin, body.editSkillId) : null;
      if (!skill || skill.type !== "editing") return { error: "Không tìm thấy skill dựng này." };
    }
    patch.editSkillId = body.editSkillId as string | null;
  }
  if (body.completedSteps !== undefined) {
    if (
      !Array.isArray(body.completedSteps) ||
      !body.completedSteps.every((step) => typeof step === "string" && STEP_KEYS.has(step))
    ) {
      return { error: "Danh sách bước không hợp lệ." };
    }
    patch.completedSteps = body.completedSteps as string[];
  }
  return { patch };
}

/** PATCH /api/videos/:id — any subset of `VideoUpdateRequest`. */
router.patch("/:id", requireAuth, (req, res) => {
  const body = req.body as Partial<Record<keyof VideoUpdateRequest, unknown>> & {
    name?: string;
    frameRatio?: unknown;
  };
  const isAdmin = req.user!.role === "admin";
  const id = req.params.id as string;
  if (!canAccessVideo(req.user!.id, isAdmin, id)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  const pipeline = pipelinePatch(req.user!.id, isAdmin, id, body);
  if ("error" in pipeline) {
    res.status(400).json({ error: pipeline.error });
    return;
  }
  if (body.name === undefined && body.frameRatio === undefined && Object.keys(pipeline.patch).length === 0) {
    res.status(400).json({ error: "Không có gì để cập nhật." });
    return;
  }
  const name = body.name?.trim();
  if (body.name !== undefined && !name) {
    res.status(400).json({ error: "Tên video không được để trống." });
    return;
  }
  if (body.frameRatio !== undefined && !isFrameRatio(body.frameRatio)) {
    res.status(400).json({ error: "Khung hình không hợp lệ." });
    return;
  }
  if (name) renameVideo(req.user!.id, isAdmin, id, name);
  if (isFrameRatio(body.frameRatio)) setVideoFrameRatio(req.user!.id, isAdmin, id, body.frameRatio);
  updateVideoPipeline(id, pipeline.patch);
  res.json(getVideo(req.user!.id, isAdmin, id));
});

router.delete("/:id", requireAuth, (req, res) => {
  softDeleteVideo(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  res.json({ ok: true });
});

export default router;
