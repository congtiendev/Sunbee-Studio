import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { buildExport, importBundle } from "../services/export-import.js";
import {
  listTrash,
  purgeTrashItem,
  restoreTrashItem,
} from "../services/db/trash-repo.js";
import type { DataExportBundle, TrashItemType } from "../../shared/types.js";

const router = Router();

router.get("/export", requireAuth, (req, res) => {
  res.json(buildExport(req.user!.id));
});

// ---------- trash (soft-deleted projects/categories/videos) ----------

function isTrashItemType(value: string): value is TrashItemType {
  return value === "project" || value === "category" || value === "video";
}

router.get("/trash", requireAuth, (req, res) => {
  res.json(listTrash(req.user!.id, req.user!.role === "admin"));
});

router.post("/trash/:type/:id/restore", requireAuth, (req, res) => {
  const { type, id } = req.params as { type: string; id: string };
  if (!isTrashItemType(type)) {
    res.status(400).json({ error: "Loại mục không hợp lệ." });
    return;
  }
  const ok = restoreTrashItem(
    req.user!.id,
    req.user!.role === "admin",
    type,
    id,
  );
  if (!ok) {
    res.status(404).json({ error: "Không tìm thấy mục trong thùng rác." });
    return;
  }
  res.json({ ok: true });
});

router.delete("/trash/:type/:id", requireAuth, (req, res) => {
  const { type, id } = req.params as { type: string; id: string };
  if (!isTrashItemType(type)) {
    res.status(400).json({ error: "Loại mục không hợp lệ." });
    return;
  }
  const result = purgeTrashItem(
    req.user!.id,
    req.user!.role === "admin",
    type,
    id,
  );
  if (!result) {
    res.status(404).json({ error: "Không tìm thấy mục trong thùng rác." });
    return;
  }
  res.json(result);
});

router.post("/import", requireAuth, (req, res) => {
  const bundle = req.body as Partial<DataExportBundle>;
  if (bundle.version !== 1 || !Array.isArray(bundle.projects)) {
    res.status(400).json({ error: "File sao lưu không hợp lệ." });
    return;
  }
  try {
    res.json(importBundle(req.user!.id, bundle as DataExportBundle));
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
