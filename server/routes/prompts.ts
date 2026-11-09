import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { allAiTasks, findAiTask } from "../modules/index.js";
import {
  deletePromptOverride,
  listPromptOverridesFor,
  upsertPromptOverride,
} from "../services/db/prompt-overrides-repo.js";
import type { PromptScope, PromptTaskInfo } from "../../shared/types.js";

const router = Router();

/** Every AI task with its default prompts and the overrides that apply to the caller. */
router.get("/", requireAuth, (req, res) => {
  const overrides = listPromptOverridesFor(req.user!.id);
  const find = (scope: PromptScope, taskKey: string, slot: string) =>
    overrides.find((o) => o.scope === scope && o.taskKey === taskKey && o.slot === slot)
      ?.content;

  const tasks: PromptTaskInfo[] = allAiTasks().map((task) => ({
    key: task.key,
    module: task.module,
    group: task.group,
    label: task.label,
    description: task.description,
    prompts: task.prompts.map((slot) => ({
      key: slot.key,
      label: slot.label,
      description: slot.description,
      defaultContent: slot.default,
      userOverride: find("user", task.key, slot.key),
      globalOverride: find("global", task.key, slot.key),
    })),
  }));
  res.json(tasks);
});

/**
 * Validates the target slot and scope. Global overrides apply to everyone,
 * so only admins may change them. Returns null after sending an error.
 */
function resolveTarget(req: Request, res: Response) {
  const taskKey = req.params.taskKey as string;
  const slot = req.params.slot as string;
  const scope = ((req.body as { scope?: string })?.scope ?? req.query.scope ?? "user") as string;

  const task = findAiTask(taskKey);
  if (!task || !task.prompts.some((p) => p.key === slot)) {
    res.status(404).json({ error: "Không tìm thấy prompt này." });
    return null;
  }
  if (scope !== "user" && scope !== "global") {
    res.status(400).json({ error: "Phạm vi không hợp lệ." });
    return null;
  }
  if (scope === "global" && req.user!.role !== "admin") {
    res.status(403).json({ error: "Chỉ admin mới được sửa prompt chung." });
    return null;
  }
  return {
    taskKey,
    slot,
    scope: scope as PromptScope,
    ownerId: scope === "global" ? "" : req.user!.id,
  };
}

router.put("/:taskKey/:slot", requireAuth, (req, res) => {
  const target = resolveTarget(req, res);
  if (!target) return;
  const content = (req.body as { content?: string }).content;
  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Prompt không được để trống." });
    return;
  }
  res.json(
    upsertPromptOverride(target.scope, target.ownerId, target.taskKey, target.slot, content),
  );
});

/** Removes the override at that scope, falling back to the next level. */
router.delete("/:taskKey/:slot", requireAuth, (req, res) => {
  const target = resolveTarget(req, res);
  if (!target) return;
  deletePromptOverride(target.scope, target.ownerId, target.taskKey, target.slot);
  res.json({ ok: true });
});

export default router;
