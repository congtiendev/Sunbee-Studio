import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { createVideo, listVideos } from "../services/db/videos-repo.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const categoryId = req.query.categoryId;
  if (typeof categoryId !== "string" || !categoryId) {
    res.status(400).json({ error: "Thiếu categoryId." });
    return;
  }
  res.json(listVideos(req.user!.id, req.user!.role === "admin", categoryId));
});

router.post("/", requireAuth, (req, res) => {
  const body = req.body as { categoryId?: string; name?: string };
  const name = body.name?.trim();
  if (!body.categoryId || !name) {
    res.status(400).json({ error: "Thiếu categoryId hoặc tên video." });
    return;
  }
  res.json(createVideo(req.user!.id, body.categoryId, name));
});

export default router;
