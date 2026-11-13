import type {
  RecurringCharacter,
  RecurringObject,
  ScriptAnalysisRecord,
  ScriptAnalyzeRequest,
  ScriptAnalyzeResponse,
  ScriptApproveRequest,
  ScriptNarrationRequest,
  User,
} from "../../../shared/types.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
} from "../../services/ai/task.js";
import {
  analyzeChunkCount,
  chunkCountForFrames,
} from "../../../shared/script-cost-estimate.js";
import { chunkScriptText, mergeAnalyzeResults, splitFramesInto } from "./chunking.js";
import { loadScriptContext } from "./context-loader.js";
import { updateVideoPipeline } from "../../services/db/videos-repo.js";
import { getScriptAnalysisById, saveScriptVersion, updateAnalyzedScenes } from "./repo.js";
import { analyzeScriptTask } from "./tasks/analyze.js";
import { extractCharactersTask } from "./tasks/extract-characters.js";
import { extractNarrationTask } from "./tasks/extract-narration.js";

type Caller = Pick<User, "id" | "role">;

/**
 * Analyze a script and persist it as a new "analyzed" version. Shared by
 * the HTTP route and the MCP tool so both run the exact same pipeline.
 */
export async function analyzeScriptForUser(
  caller: Caller,
  req: ScriptAnalyzeRequest,
): Promise<ScriptAnalyzeResponse> {
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const frames = req.frames ?? [];

  // A long script (up to ~30k characters) or a video with more frames than fit
  // in one request (the provider's per-request image cap) is split into several
  // requests — each with one script passage and the frames of that same part of
  // the video, small enough for its scenes JSON to fit one response — then the
  // results are merged before saving.
  const scriptChunks = chunkScriptText(
    req.scriptText,
    analyzeChunkCount(req.scriptText.length, frames.length),
  );
  const frameChunks = splitFramesInto(
    frames,
    Math.max(scriptChunks.length, chunkCountForFrames(frames.length)),
  );
  // Analysis doesn't write new prose, so the voice skill (genre/tone/
  // instructions, picked for the writing step) has nothing to add here —
  // only the editing skill's own approved examples/documents (if any) are
  // relevant context, and its cutting methodology is a hard constraint below.
  const context = loadScriptContext(caller, {
    skillId: req.editingStyleTemplateId,
    videoId: req.videoId,
  });
  const editingStyle = context.skill?.editingStyle;

  // Read the whole script once first to lock in a character roster (name +
  // appearance) for EVERY character, even one scene's worth: a long script
  // analyzed as several independent chunks (below) has no way to keep
  // names/appearance consistent across them on its own, and the roster is
  // also persisted as-is so later image generation reuses the same
  // appearance everywhere that character appears.
  const rosterResult = await runTask(
    extractCharactersTask,
    { scriptText: req.scriptText, provider, model: req.model, effort: req.effort },
    ctx,
  );
  const knownCharacters =
    rosterResult.characters.length > 0
      ? rosterResult.characters
          .map((c) => `${c.name} — ${c.appearance}`)
          .join("\n")
      : undefined;
  const knownObjects =
    rosterResult.objects.length > 0
      ? rosterResult.objects.map((o) => `${o.name} — ${o.appearance}`).join("\n")
      : undefined;

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
          knownCharacters,
          knownObjects,
          editingStyle,
        },
        ctx,
      ),
    ),
  );
  const result = mergeAnalyzeResults(chunkResults);
  const characterRoster: RecurringCharacter[] = rosterResult.characters;
  const objectRoster: RecurringObject[] = rosterResult.objects;

  const version = saveScriptVersion(
    caller.id,
    req.sourceType ?? "import",
    req.sourceUrl,
    req.scriptText,
    frames,
    "analyzed",
    result,
    req.videoId,
    {
      characterRoster,
      objectRoster,
      styleTemplateId: req.styleTemplateId,
      editingStyleTemplateId: req.editingStyleTemplateId,
      provider,
      model: req.model,
      language: req.language,
    },
  );
  // A fresh analysis becomes the version the video's later steps work from.
  if (req.videoId) updateVideoPipeline(req.videoId, { scriptVersionId: version.id });
  return { ...result, scenes: version.scenes, characterRoster, objectRoster, versionId: version.id };
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
  const approved = saveScriptVersion(
    caller.id,
    base.sourceType,
    base.sourceUrl,
    base.scriptText,
    base.frames,
    "analyzed",
    { scenes, resources: req.resources, style: req.style },
    base.videoId,
    {
      approved: true,
      characterRoster: req.characterRoster ?? base.characterRoster,
      objectRoster: req.objectRoster ?? base.objectRoster,
      styleTemplateId: base.styleTemplateId,
      editingStyleTemplateId: base.editingStyleTemplateId,
      provider: base.provider,
      model: base.model,
      language: base.language,
    },
  );
  // Same scene/asset ids as the base, so the video's picks carry over.
  if (base.videoId) updateVideoPipeline(base.videoId, { scriptVersionId: approved.id });
  return approved;
}

/** Scenes per "extract narration" request; batches run in parallel. */
const NARRATION_SCENES_PER_CALL = 25;

/**
 * Fills in every scene's `narration` of an analyzed version from its script
 * text, in place: same scenes, ids and picks (a fresh analysis would make
 * new ones and lose the picks). For versions analyzed before narration
 * existed, or whose narration no longer matches the script.
 */
export async function extractNarrationForVersion(
  caller: Caller,
  req: ScriptNarrationRequest,
): Promise<ScriptAnalysisRecord> {
  const isAdmin = caller.role === "admin";
  const base = getScriptAnalysisById(caller.id, isAdmin, req.versionId);
  if (!base || base.kind !== "analyzed") throw new Error("Không tìm thấy bản phân tích này.");
  if (base.scenes.length === 0) return base;
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const batches: ScriptAnalysisRecord["scenes"][] = [];
  for (let i = 0; i < base.scenes.length; i += NARRATION_SCENES_PER_CALL) {
    batches.push(base.scenes.slice(i, i + NARRATION_SCENES_PER_CALL));
  }
  const results = await Promise.all(
    batches.map((scenes, i) =>
      runTask(
        extractNarrationTask,
        {
          scriptText: base.scriptText,
          scenes,
          previousSceneContent: i > 0 ? batches[i - 1]!.at(-1)?.content : undefined,
          provider,
          model: req.model,
          effort: req.effort,
        },
        ctx,
      ),
    ),
  );
  const narration = new Map(results.flatMap((result) => result.scenes.map((s) => [s.index, s.narration] as const)));
  const scenes = base.scenes.map((scene) => ({
    ...scene,
    narration: narration.get(scene.index)?.trim() ?? scene.narration ?? "",
  }));
  const updated = updateAnalyzedScenes(caller.id, isAdmin, base.id, scenes);
  if (!updated) throw new Error("Không lưu được lời đọc.");
  return updated;
}
