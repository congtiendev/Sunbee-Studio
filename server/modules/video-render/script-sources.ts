import type { RenderProject, RenderSourceMode, User } from "../../../shared/types.js";
import { taskContextFor } from "../../services/ai/task.js";
import { writeScriptFromDocuments } from "../script/sources/document.js";
import { writeScriptFromIdea } from "../script/sources/idea.js";
import { fetchScriptFromLink } from "../script/sources/link.js";
import { generateScriptFromTemplate } from "../script/sources/template.js";
import { transcribeVideoFile } from "../script/sources/upload.js";

/**
 * The Video Studio's script sources, run for a render project. Only their code
 * is shared: the script comes back here and is stored in the render project —
 * never saved as a Studio script version.
 */
export type RenderScriptSource = Exclude<RenderSourceMode, "script" | "upload">;

export const RENDER_SCRIPT_SOURCES: RenderScriptSource[] = ["link", "document", "idea", "template"];

/** The script from a non-upload source, using the inputs and AI options saved on the project. */
export async function scriptFromSource(
  caller: User,
  project: RenderProject,
  source: RenderScriptSource,
): Promise<string> {
  const options = project.sourceOptions;
  const targetDurationSec = project.targetDurationSec ?? undefined;
  const ai = {
    provider: options.provider,
    model: options.model,
    effort: options.effort,
    language: options.language,
  };

  if (source === "link") {
    if (!options.url?.trim()) throw new Error("Vui lòng nhập link video.");
    const result = await fetchScriptFromLink(options.url.trim(), taskContextFor(caller.id), {
      ...ai,
      useAi: options.linkUseAi ?? true,
    });
    return result.scriptText;
  }
  if (source === "document") {
    const result = await writeScriptFromDocuments(caller, {
      ...ai,
      documentIds: options.documentIds ?? [],
      brief: options.brief,
      targetDurationSec,
      styleTemplateId: options.styleTemplateId,
    });
    return result.scriptText;
  }
  if (source === "idea") {
    const result = await writeScriptFromIdea(caller, {
      ...ai,
      idea: project.ideaText,
      targetDurationSec,
      styleTemplateId: options.styleTemplateId,
    });
    return result.scriptText;
  }
  if (!options.templateVersionId) throw new Error("Vui lòng chọn kịch bản mẫu.");
  const result = await generateScriptFromTemplate(caller, {
    ...ai,
    templateVersionId: options.templateVersionId,
    topic: options.topic ?? "",
    documentIds: options.documentIds,
    targetDurationSec,
    styleTemplateId: options.styleTemplateId,
  });
  return result.scriptText;
}

/** The script transcribed from an uploaded video/audio file (needs an OpenAI key for speech-to-text). */
export async function scriptFromUpload(
  caller: User,
  project: RenderProject,
  file: { buffer: Buffer; originalname: string },
): Promise<string> {
  const options = project.sourceOptions;
  const result = await transcribeVideoFile(file.buffer, file.originalname, taskContextFor(caller.id), {
    describeProvider: options.provider,
    describeModel: options.model,
    describeEffort: options.effort,
    language: options.language,
  });
  return result.scriptText;
}
