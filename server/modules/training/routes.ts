import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import type { SkillTrainingRequest } from "../../../shared/types.js";
import {
  listVersionsOfSkill,
  restoreSkillVersion,
  runSkillTraining,
} from "./service.js";
import { listTrainingSources } from "./sources/index.js";

const router = Router();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Every source kind with what the user can pick from it. */
router.get("/sources", requireAuth, (req, res) => {
  res.json(listTrainingSources(req.user!));
});

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
