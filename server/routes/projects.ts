import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createProject,
  getProject,
  listProjects,
  renameProject,
  softDeleteProject,
} from "../services/db/projects-repo.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json(listProjects(req.user!.id, req.user!.role === "admin"));
});

router.get("/:id", requireAuth, (req, res) => {
  const project = getProject(req.user!.id, req.user!.role === "admin", req.params.id as string);
  if (!project) {
    res.status(404).json({ error: "Không tìm thấy dự án." });
    return;
  }
  res.json(project);
});

router.post("/", requireAuth, (req, res) => {
  const name = (req.body as { name?: string }).name?.trim();
  if (!name) {
    res.status(400).json({ error: "Tên dự án không được để trống." });
    return;
  }
  res.json(createProject(req.user!.id, name));
});

router.patch("/:id", requireAuth, (req, res) => {
  const name = (req.body as { name?: string }).name?.trim();
  if (!name) {
    res.status(400).json({ error: "Tên dự án không được để trống." });
    return;
  }
  renameProject(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
    name,
  );
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req, res) => {
  softDeleteProject(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  res.json({ ok: true });
});

export default router;
