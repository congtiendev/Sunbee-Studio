import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { getFileForUser } from "../services/storage/files.js";

const router = Router();

router.get("/:id", requireAuth, (req, res) => {
  const file = getFileForUser(req.user!.id, req.user!.role === "admin", req.params.id as string);
  if (!file) {
    res.status(404).json({ error: "Không tìm thấy file." });
    return;
  }
  res.setHeader("Content-Type", file.mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  );
  res.sendFile(file.absolutePath);
});

export default router;
