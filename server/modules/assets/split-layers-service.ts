import type {
  AssetSplitLayersRequest,
  AssetSplitLayersResponse,
  RequiredAsset,
  SceneShot,
  User,
} from "../../../shared/types.js";
import {
  firstAvailableProvider,
  runTask,
  taskContextFor,
} from "../../services/ai/task.js";
import { getTemplateById } from "../../services/db/style-templates-repo.js";
import { getScriptAnalysisById, updateAnalyzedScenes } from "../script/repo.js";
import { clearSceneResources } from "./repo.js";
import { splitLayersTask } from "./tasks/split-layers.js";

type Caller = Pick<User, "id" | "role">;

/** Scenes per AI call when planning shots & layers — each scene's answer is long (shots + images per shot). */
const SPLIT_SCENES_PER_CALL = 4;

const descriptionKey = (text: string) =>
  text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Gives each re-planned asset the id of the old asset it is (same type and
 * description, each old one used once), so its pick survives; genuinely new
 * assets keep the fresh id the re-plan gave them.
 */
function keepAssetIds(
  before: RequiredAsset[],
  after: RequiredAsset[],
): RequiredAsset[] {
  const unused = [...before];
  return after.map((asset) => {
    const i = unused.findIndex(
      (old) =>
        old.type === asset.type &&
        descriptionKey(old.description) === descriptionKey(asset.description),
    );
    if (i === -1) return asset;
    const [match] = unused.splice(i, 1);
    return { ...asset, id: match!.id };
  });
}

/**
 * Splits the moving subjects of a scene range into layers (a background frame
 * plus one transparent cutout per visual state) on an existing analysis, and
 * overwrites that version's scenes in place (no new version — re-running this
 * is an annotation pass, not a creative redo worth a history entry). Assets the
 * re-plan keeps keep their id and pick; picks of assets it dropped are cleared.
 */
export async function splitLayersForRange(
  caller: Caller,
  body: AssetSplitLayersRequest,
): Promise<AssetSplitLayersResponse> {
  const admin = caller.role === "admin";
  const base = getScriptAnalysisById(caller.id, admin, body.versionId);
  if (!base || base.videoId !== body.videoId || base.kind !== "analyzed") {
    throw new Error("Không tìm thấy bản phân tích của video này.");
  }
  const ctx = taskContextFor(caller.id);
  const provider = firstAvailableProvider(ctx, body.provider ?? "claude");
  if (!provider)
    throw new Error("Chưa thiết lập API key AI (Claude hoặc OpenAI).");
  const inRange = base.scenes.filter(
    (scene) => scene.index >= body.fromScene && scene.index <= body.toScene,
  );
  if (inRange.length === 0)
    throw new Error("Không có cảnh nào trong khoảng đã chọn.");
  const rosterNames = [
    ...(base.characterRoster ?? []).map((c) => c.name),
    ...(base.objectRoster ?? []).map((o) => o.name),
  ];
  // The video's editing skill shapes how scenes are broken into shots.
  const editingStyle = base.editingStyleTemplateId
    ? getTemplateById(caller.id, admin, base.editingStyleTemplateId)
        ?.editingStyle
    : undefined;
  const rewritten = new Map<
    number,
    { shots: SceneShot[]; requiredAssets: RequiredAsset[] }
  >();
  for (let i = 0; i < inRange.length; i += SPLIT_SCENES_PER_CALL) {
    const batch = inRange.slice(i, i + SPLIT_SCENES_PER_CALL);
    // The scene before the batch — already re-planned in this run when there is one.
    const before = base.scenes.find(
      (scene) => scene.index === batch[0]!.index - 1,
    );
    const previousScene =
      before && rewritten.has(before.index)
        ? { ...before, ...rewritten.get(before.index)! }
        : before;
    const output = await runTask(
      splitLayersTask,
      {
        scenes: batch,
        rosterNames,
        editingStyle,
        previousScene,
        provider,
        model: body.model,
        effort: body.effort,
      },
      ctx,
    );
    for (const scene of output.scenes) {
      if (batch.some((s) => s.index === scene.index)) {
        rewritten.set(scene.index, {
          shots: scene.shots,
          requiredAssets: scene.requiredAssets,
        });
      }
    }
  }
  const changedScenes: number[] = [];
  const droppedAssetIds: string[] = [];
  const scenes = base.scenes.map((scene) => {
    const plan = rewritten.get(scene.index);
    if (!plan) return scene;
    // An asset the re-plan kept (same description) keeps its id — and so its pick.
    const requiredAssets = keepAssetIds(
      scene.requiredAssets,
      plan.requiredAssets,
    );
    const sameAssets =
      JSON.stringify(requiredAssets) === JSON.stringify(scene.requiredAssets) &&
      JSON.stringify(plan.shots) === JSON.stringify(scene.shots ?? []);
    if (sameAssets) return scene;
    changedScenes.push(scene.index);
    const kept = new Set(requiredAssets.map((asset) => asset.id));
    droppedAssetIds.push(
      ...scene.requiredAssets.map((a) => a.id).filter((id) => !kept.has(id)),
    );
    return { ...scene, shots: plan.shots, requiredAssets };
  });
  const version =
    changedScenes.length > 0
      ? (updateAnalyzedScenes(caller.id, admin, base.id, scenes) ?? base)
      : base;
  clearSceneResources(body.videoId, droppedAssetIds);
  return { version, changedScenes };
}
