import type {
  RecurringCharacter,
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
import {
  analyzeChunkCount,
  chunkCountForFrames,
} from "../../../shared/script-cost-estimate.js";
import { chunkScriptText, mergeAnalyzeResults, splitFramesInto } from "./chunking.js";
import { loadScriptContext } from "./context-loader.js";
import { getScriptAnalysisById, saveScriptVersion } from "./repo.js";
import { analyzeScriptTask } from "./tasks/analyze.js";
import { extractCharactersTask } from "./tasks/extract-characters.js";

type Caller = Pick<User, "id" | "role">;

/** Characters whose name shows up in 2+ scenes — worth locking an appearance for; a single appearance is just an illustrative figure, not worth reusing. */
function recurringCharacters(
  scenes: { characters?: { name: string }[] }[],
  roster: { name: string; appearance: string }[],
): RecurringCharacter[] {
  const sceneCounts = new Map<string, number>();
  for (const scene of scenes) {
    for (const name of new Set((scene.characters ?? []).map((c) => c.name))) {
      sceneCounts.set(name, (sceneCounts.get(name) ?? 0) + 1);
    }
  }
  return roster.filter((c) => (sceneCounts.get(c.name) ?? 0) >= 2);
}

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
  const context = loadScriptContext(caller, {
    skillId: req.styleTemplateId,
    videoId: req.videoId,
  });

  // Read the whole script once first to lock in a character roster (name +
  // appearance): a long script analyzed as several independent chunks (below)
  // has no way to keep names/appearance consistent across them on its own,
  // and the roster is also persisted (see recurringCharacters() below) so
  // later image generation reuses the same appearance in every scene.
  const rosterResult = await runTask(
    extractCharactersTask,
    { scriptText: req.scriptText, provider, model: req.model },
    ctx,
  );
  const knownCharacters =
    rosterResult.characters.length > 0
      ? rosterResult.characters
          .map((c) => `${c.name} — ${c.appearance}`)
          .join("\n")
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
        },
        ctx,
      ),
    ),
  );
  const result = mergeAnalyzeResults(chunkResults);
  const characterRoster = recurringCharacters(
    result.scenes,
    rosterResult.characters,
  );

  const version = saveScriptVersion(
    caller.id,
    req.sourceType ?? "import",
    req.sourceUrl,
    req.scriptText,
    frames,
    "analyzed",
    result,
    req.videoId,
    { characterRoster },
  );
  return { ...result, characterRoster, versionId: version.id };
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
    { approved: true, characterRoster: base.characterRoster },
  );
}
