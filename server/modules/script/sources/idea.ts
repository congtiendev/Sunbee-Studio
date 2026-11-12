import type { ScriptFromIdeaRequest } from "../../../../shared/types.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../../services/ai/task.js";
import type { Caller } from "../../../services/skills/skills.js";
import { loadScriptContext } from "../context-loader.js";
import { scriptFromIdeaTask } from "../tasks/from-idea.js";

/**
 * Script source "idea": the AI writes a full script from a short idea alone
 * — no reference documents, following the chosen skill if any.
 */
export async function writeScriptFromIdea(
  caller: Caller,
  req: ScriptFromIdeaRequest,
): Promise<{ scriptText: string }> {
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const idea = req.idea?.trim();
  if (!idea) throw new Error("Vui lòng nhập ý tưởng.");

  const context = loadScriptContext(caller, {
    skillId: req.styleTemplateId,
    videoId: req.videoId,
  });

  const scriptText = await runTask(
    scriptFromIdeaTask,
    {
      idea,
      targetDurationSec: req.targetDurationSec,
      language: req.language ?? "vi",
      provider,
      model: req.model,
      effort: req.effort,
      context,
    },
    ctx,
  );
  return { scriptText };
}
