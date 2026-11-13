import { Router } from "express";
import type {
  CapcutExportRequest,
  CapcutExportResponse,
  EditRecipeChoices,
  EditStyleLearnRequest,
} from "../../../shared/edit-plan.js";
import { requireVideoAccess } from "../../middleware/require-access.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { writeCapcutDraft } from "../../services/capcut/writer.js";
import { buildEditPlan } from "./build-timeline.js";
import { capcutChoices } from "../../services/capcut/lookup.js";
import { countAssetsBySourcePack } from "../assets/repo.js";
import { listSfxKitCategories } from "../assets/sound-effects/sfx-kit-catalog.js";
import { learnEditingStyle } from "./learn/service.js";

const router = Router();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A scene number from the query/body, or undefined when absent or not a positive integer. */
function sceneNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** GET /api/edit-plan/timeline?videoId=&fromScene=&toScene= — the video laid out as a timeline, with what's missing. */
router.get("/timeline", requireAuth, requireVideoAccess, async (req, res) => {
  const videoId = req.query.videoId;
  if (typeof videoId !== "string" || !videoId) {
    res.status(400).json({ error: "Thiếu video." });
    return;
  }
  try {
    res.json(
      await buildEditPlan(req.user!, videoId, {
        fromScene: sceneNumber(req.query.fromScene),
        toScene: sceneNumber(req.query.toScene),
      }),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** POST /api/edit-plan/capcut — writes the timeline as a new project in CapCut's draft folder. */
router.post("/capcut", requireAuth, requireVideoAccess, async (req, res) => {
  const { videoId, fromScene, toScene } = req.body as CapcutExportRequest;
  if (!videoId) {
    res.status(400).json({ error: "Thiếu video." });
    return;
  }
  try {
    const plan = await buildEditPlan(req.user!, videoId, {
      fromScene: sceneNumber(fromScene),
      toScene: sceneNumber(toScene),
    });
    const draft = await writeCapcutDraft(plan.timeline);
    const response: CapcutExportResponse = {
      folderName: draft.folderName,
      folderPath: draft.folderPath,
      durationMs: draft.durationMs,
      warnings: plan.warnings,
    };
    res.json(response);
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** GET /api/edit-plan/recipe-choices — CapCut built-ins and sound-effect categories a recipe can use. */
router.get("/recipe-choices", requireAuth, (req, res) => {
  const choices: EditRecipeChoices = {
    ...capcutChoices(),
    sfxCategories: listSfxKitCategories().map((category) => ({
      id: category.id,
      title: category.title,
      installed: countAssetsBySourcePack(req.user!.id, `sfxkit:${category.id}`) > 0,
    })),
  };
  res.json(choices);
});

/** POST /api/edit-plan/learn-style — an editing skill (guide + recipe) learned from a sample video link. */
router.post("/learn-style", requireAuth, async (req, res) => {
  try {
    res.json(await learnEditingStyle(req.user!, req.body as EditStyleLearnRequest));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

export default router;
