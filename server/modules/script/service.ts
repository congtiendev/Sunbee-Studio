import type {
  ScriptAnalysisRecord,
  ScriptAnalyzeRequest,
  ScriptAnalyzeResponse,
  ScriptApproveRequest,
  User,
} from "../../../shared/types.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../services/ai/task.js";
import { chunkFrames, chunkScriptText, mergeAnalyzeResults } from "./chunking.js";
import { loadScriptContext } from "./context-loader.js";
import { getScriptAnalysisById, saveScriptVersion } from "./repo.js";
import { analyzeScriptTask } from "./tasks/analyze.js";

type Caller = Pick<User, "id" | "role">;

/**
 * Analyze a script and persist it as a new "analyzed" version. Shared by
 * the HTTP route and the MCP tool so both run the exact same pipeline.
 */
export async function analyzeScriptForUser(
  caller: Caller,
  req: ScriptAnalyzeRequest,
): Promise<ScriptAnalyzeResponse> {
  const provider = req.provider ?? "openai";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const frames = req.frames ?? [];

  // A video long enough to need more frames than fit in one request (the
  // provider's hard per-request image cap) gets split into several
  // requests — each with the frames and matching script passage for its
  // slice of the video — then merged into one result before saving.
  const frameChunks = chunkFrames(frames);
  const scriptChunks = chunkScriptText(req.scriptText, frameChunks.length);
  const context = loadScriptContext(caller, {
    skillId: req.styleTemplateId,
    videoId: req.videoId,
  });

  const chunkResults = await Promise.all(
    frameChunks.map((chunkFramesSlice, i) =>
      runTask(
        analyzeScriptTask,
        {
          scriptText: scriptChunks[i] ?? req.scriptText,
          frames: chunkFramesSlice,
          provider,
          model: req.model,
          effort: req.effort,
          context,
        },
        ctx,
      ),
    ),
  );
  const result = mergeAnalyzeResults(chunkResults);

  const version = saveScriptVersion(
    caller.id,
    req.sourceType ?? "import",
    req.sourceUrl,
    req.scriptText,
    frames,
    "analyzed",
    result,
    req.videoId,
  );
  return { ...result, versionId: version.id };
}

/**
 * Save the user's reviewed (and possibly edited) scenes as a new approved
 * version of the same script. Script text, frames and source are copied
 * from the base version server-side, so the client only sends the scenes.
 */
export function approveScriptVersion(
  caller: Caller,
  req: ScriptApproveRequest,
): ScriptAnalysisRecord {
  const base = getScriptAnalysisById(
    caller.id,
    caller.role === "admin",
    req.versionId,
  );
  if (!base) throw new Error("Không tìm thấy phiên bản kịch bản này.");
  if (!Array.isArray(req.scenes) || req.scenes.length === 0) {
    throw new Error("Phiên bản cần có ít nhất một cảnh.");
  }
  const scenes = req.scenes.map((scene, i) => ({ ...scene, index: i + 1 }));
  return saveScriptVersion(
    caller.id,
    base.sourceType,
    base.sourceUrl,
    base.scriptText,
    base.frames,
    "analyzed",
    { scenes, resources: req.resources, style: req.style },
    base.videoId,
    { approved: true },
  );
}
