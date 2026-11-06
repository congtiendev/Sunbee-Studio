import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
} from "../services/db/style-templates-repo.js";
import type { StyleTemplate } from "../../shared/types.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json(listTemplates(req.user!.id, req.user!.role === "admin"));
});

router.post("/", requireAuth, (req, res) => {
  const template = req.body as Omit<
    StyleTemplate,
    "id" | "createdAt" | "userId" | "ownerEmail"
  >;
  res.json(saveTemplate(req.user!.id, template));
});

router.delete("/:id", requireAuth, (req, res) => {
  deleteTemplate(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  res.json({ ok: true });
});

export default router;
