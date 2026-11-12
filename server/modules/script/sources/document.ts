import type { ScriptFromDocumentRequest } from "../../../../shared/types.js";
import { getDocumentsByIds } from "../../../services/db/documents-repo.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../../services/ai/task.js";
import type { Caller } from "../../../services/skills/skills.js";
import { loadScriptContext } from "../context-loader.js";
import { scriptFromDocumentTask } from "../tasks/from-document.js";

const MAX_SOURCE_DOCUMENTS = 5;

/**
 * Script source "document": the AI writes a script from the user's
 * reference documents, following the chosen skill if any.
 */
export async function writeScriptFromDocuments(
  caller: Caller,
  req: ScriptFromDocumentRequest,
): Promise<{ scriptText: string; documentTitles: string[] }> {
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const ids = (req.documentIds ?? []).slice(0, MAX_SOURCE_DOCUMENTS);
  const documents = getDocumentsByIds(caller.id, caller.role === "admin", ids);
  if (documents.length === 0)
    throw new Error("Vui lòng chọn ít nhất một tài liệu.");

  const context = loadScriptContext(caller, {
    skillId: req.styleTemplateId,
    videoId: req.videoId,
  });
  // The source documents are already in the user turn; don't repeat them as reference context.
  const sourceIds = new Set(documents.map((doc) => doc.id));
  context.documents = context.documents?.filter(
    (doc) => !sourceIds.has(doc.id),
  );

  const scriptText = await runTask(
    scriptFromDocumentTask,
    {
      documents,
      brief: req.brief,
      targetDurationSec: req.targetDurationSec,
      language: req.language ?? "vi",
      provider,
      model: req.model,
      effort: req.effort,
      context,
    },
    ctx,
  );
  return { scriptText, documentTitles: documents.map((doc) => doc.title) };
}
