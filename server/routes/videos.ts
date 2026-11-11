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
} from "../services/db/videos-repo.js";
import { isFrameRatio } from "../../shared/frame-ratio.js";

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

/** PATCH /api/videos/:id — `name` and/or `frameRatio`. */
router.patch("/:id", requireAuth, (req, res) => {
  const body = req.body as { name?: string; frameRatio?: unknown };
  const isAdmin = req.user!.role === "admin";
  const id = req.params.id as string;
  if (!canAccessVideo(req.user!.id, isAdmin, id)) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  if (body.name === undefined && body.frameRatio === undefined) {
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
  res.json({ ok: true });
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
