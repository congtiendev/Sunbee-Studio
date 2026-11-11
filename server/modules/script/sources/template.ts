import type {
  ScriptFromTemplateRequest,
  ScriptFromTemplateResponse,
} from "../../../../shared/types.js";
import { getDocumentsByIds } from "../../../services/db/documents-repo.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../../services/ai/task.js";
import type { Caller } from "../../../services/skills/skills.js";
import { loadScriptContext } from "../context-loader.js";
import { getScriptAnalysisById, saveScriptVersion } from "../repo.js";
import { scriptFromTemplateTask } from "../tasks/from-template.js";

const MAX_TEMPLATE_DOCUMENTS = 3;

/**
 * Script source "template": a new script on a new topic, modelled on an
 * analyzed version (structure, pacing, voice). The result is already split
 * into scenes, so it is saved directly as an analyzed version.
 */
export async function writeScriptFromTemplate(
  caller: Caller,
  req: ScriptFromTemplateRequest,
): Promise<ScriptFromTemplateResponse> {
  const provider = req.provider ?? "openai";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  if (!req.topic?.trim())
    throw new Error("Vui lòng nhập chủ đề cho video mới.");
  const template = getScriptAnalysisById(
    caller.id,
    caller.role === "admin",
    req.templateVersionId,
  );
  if (
    !template ||
    template.kind !== "analyzed" ||
    template.scenes.length === 0
  ) {
    throw new Error("Video mẫu phải là một phiên bản đã phân tích (có cảnh).");
  }
  const documents = getDocumentsByIds(
    caller.id,
    caller.role === "admin",
    (req.documentIds ?? []).slice(0, MAX_TEMPLATE_DOCUMENTS),
  );

  const context = loadScriptContext(caller, {
    skillId: req.styleTemplateId,
    videoId: req.videoId,
  });
  const sourceIds = new Set(documents.map((doc) => doc.id));
  context.documents = context.documents?.filter(
    (doc) => !sourceIds.has(doc.id),
  );
  // The template itself is the example to follow; don't also send it as a few-shot example.
  context.examples = context.examples?.filter(
    (example) => example.id !== template.id,
  );

  const { scriptText, ...analysis } = await runTask(
    scriptFromTemplateTask,
    {
      template,
      topic: req.topic,
      documents,
      targetDurationSec: req.targetDurationSec,
      language: req.language ?? "vi",
      provider,
      model: req.model,
      effort: req.effort,
      context,
    },
    ctx,
  );

  const scenes = analysis.scenes.map((scene, i) => ({
    ...scene,
    index: i + 1,
  }));
  const version = saveScriptVersion(
    caller.id,
    "template",
    undefined,
    scriptText,
    [],
    "analyzed",
    { scenes, resources: analysis.resources, style: analysis.style },
    req.videoId,
    {
      templateSourceId: template.id,
      styleTemplateId: req.styleTemplateId,
      provider,
      model: req.model,
      language: req.language ?? "vi",
    },
  );
  return {
    scriptText,
    scenes,
    resources: analysis.resources,
    style: analysis.style,
    versionId: version.id,
  };
}
