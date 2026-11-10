import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth.js";
import type { SkillTrainingRequest } from "../../../shared/types.js";
import { createTrainingImage } from "../../services/db/training-images-repo.js";
import { saveFile } from "../../services/storage/files.js";
import {
  listVersionsOfSkill,
  restoreSkillVersion,
  runSkillTraining,
} from "./service.js";
import { listTrainingSources } from "./sources/index.js";

const router = Router();

const MAX_TRAINING_IMAGE_BYTES = 10 * 1024 * 1024;
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TRAINING_IMAGE_BYTES },
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Every source kind with what the user can pick from it. */
router.get("/sources", requireAuth, (req, res) => {
  res.json(listTrainingSources(req.user!));
});

/** Add an example image to the caller's image-skill training library. */
router.post(
  "/images",
  requireAuth,
  (req, res, next) => {
    uploadImage.single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn ảnh." });
      return;
    }
    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Chỉ nhận file ảnh." });
      return;
    }
    const stored = await saveFile(
      req.user!.id,
      "skill-attachment",
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    const record = createTrainingImage(req.user!.id, stored.id, req.file.originalname);
    res.json({ id: record.id, title: record.title, fileId: record.fileId });
  },
);

router.post("/run", requireAuth, async (req, res) => {
  try {
    res.json(
      await runSkillTraining(req.user!, req.body as SkillTrainingRequest),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.get("/skills/:id/versions", requireAuth, (req, res) => {
  try {
    res.json(listVersionsOfSkill(req.user!, req.params.id as string));
  } catch (err) {
    res.status(404).json({ error: errorMessage(err) });
  }
});

router.post(
  "/skills/:id/versions/:versionId/restore",
  requireAuth,
  (req, res) => {
    try {
      res.json(
        restoreSkillVersion(
          req.user!,
          req.params.id as string,
          req.params.versionId as string,
        ),
      );
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

export default router;
