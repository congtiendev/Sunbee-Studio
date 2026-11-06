import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createCategory,
  listCategories,
  renameCategory,
  softDeleteCategory,
} from "../services/db/categories-repo.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const projectId = req.query.projectId;
  if (typeof projectId !== "string" || !projectId) {
    res.status(400).json({ error: "Thiếu projectId." });
    return;
  }
  res.json(listCategories(req.user!.id, req.user!.role === "admin", projectId));
});

router.post("/", requireAuth, (req, res) => {
  const body = req.body as { projectId?: string; name?: string };
  const name = body.name?.trim();
  if (!body.projectId || !name) {
    res.status(400).json({ error: "Thiếu projectId hoặc tên danh mục." });
    return;
  }
  res.json(createCategory(req.user!.id, body.projectId, name));
});

router.patch("/:id", requireAuth, (req, res) => {
  const name = (req.body as { name?: string }).name?.trim();
  if (!name) {
    res.status(400).json({ error: "Tên danh mục không được để trống." });
    return;
  }
  renameCategory(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
    name,
  );
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req, res) => {
  softDeleteCategory(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  res.json({ ok: true });
});

export default router;
