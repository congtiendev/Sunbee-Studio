import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { buildExport, importBundle } from "../services/export-import.js";
import type { DataExportBundle } from "../../shared/types.js";

const router = Router();

router.get("/export", requireAuth, (req, res) => {
  res.json(buildExport(req.user!.id));
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
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
