import { randomUUID } from "node:crypto";
import type {
  AssetEnrichRequest,
  AssetEnrichResponse,
  RequiredAsset,
  ScriptScene,
  ShotSticker,
  User,
} from "../../../shared/types.js";
import { firstAvailableProvider, runTask, taskContextFor } from "../../services/ai/task.js";
import { getScriptAnalysisById, updateAnalyzedScenes } from "../script/repo.js";
import { parsePlacement } from "../edit-plan/layout.js";
import { clearSceneResources } from "./repo.js";
import { enrichShotsTask, type EnrichShotsOutput } from "./tasks/enrich-shots.js";

type Caller = Pick<User, "id" | "role">;

/** A real photo "enrich shots" added (to research, not generate). */
const ADDED_PHOTO = /^Ảnh thật \(bổ sung\):/;
const isAddedPhoto = (asset: RequiredAsset) => ADDED_PHOTO.test(asset.description.trim());

/** A sticker sheet: one image holding a grid of icons ("Sticker sheet 9 ô (3×3): 1) …"). */
export const STICKER_SHEET = /^sticker sheet/i;
export const isStickerSheet = (asset: RequiredAsset) => STICKER_SHEET.test(asset.description.trim());

/** Scenes per AI call, and calls at once. */
const SCENES_PER_CALL = 6;
const PARALLEL_CALLS = 3;
/** Icons per sheet: one ChatGPT image of a 4×4 grid still draws each icon clearly. */
const MAX_PER_SHEET = 16;

/** The smallest square-ish grid holding n icons. */
export function gridFor(n: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/** How a sheet is described to the image prompt writer (and read back by the edit plan: cell count and grid). */
export function sheetDescription(labels: string[]): string {
  const { cols, rows } = gridFor(labels.length);
  return (
    `Sticker sheet ${labels.length} ô (${cols}×${rows}): bộ icon minh hoạ cùng một phong cách với video, ` +
    `mỗi ô một icon riêng đứng giữa ô trên nền trong suốt, cách xa mép ô, không có chữ, viền nét đậm rõ, ` +
    `các ô cách nhau bằng khoảng trống trong suốt. Theo thứ tự từ trái sang phải, từ trên xuống: ` +
    labels.map((label, i) => `${i + 1}) ${label}`).join("; ") +
    "."
  );
}

/**
 * Adds stickers and pop-up key words to the shots of a scene range where the
 * speaker is alone on a plain backdrop. The icons are packed into sticker-sheet
 * assets (one image to generate per up-to-16 icons) and each shot points at its
 * cells. Existing images and picks are untouched; a re-run replaces what an
 * earlier run added in the range.
 */
export async function enrichScenes(caller: Caller, req: AssetEnrichRequest): Promise<AssetEnrichResponse> {
  const admin = caller.role === "admin";
  const base = getScriptAnalysisById(caller.id, admin, req.versionId);
  if (!base || base.videoId !== req.videoId || base.kind !== "analyzed") {
    throw new Error("Không tìm thấy bản phân tích của video này.");
  }
  const ctx = taskContextFor(caller.id);
  const provider = firstAvailableProvider(ctx, req.provider ?? "claude");
  if (!provider) throw new Error("Chưa thiết lập API key AI (Claude hoặc OpenAI).");
  const inRange = (scene: ScriptScene) => scene.index >= req.fromScene && scene.index <= req.toScene;

  // What an earlier run added in the range goes: its sheets (and their picks), its stickers and key words.
  const oldSheets = base.scenes
    .filter(inRange)
    .flatMap((scene) => scene.requiredAssets.filter((asset) => isStickerSheet(asset) || isAddedPhoto(asset)));
  const cleaned = base.scenes.map((scene) =>
    inRange(scene)
      ? {
          ...scene,
          requiredAssets: scene.requiredAssets.filter((asset) => !isStickerSheet(asset) && !isAddedPhoto(asset)),
          shots: scene.shots?.map(({ stickers: _s, callouts: _c, ...shot }) => shot),
        }
      : scene,
  );
  const targets = cleaned.filter(inRange);
  if (targets.length === 0) throw new Error("Không có cảnh nào trong khoảng đã chọn.");

  const rosterNames = (base.characterRoster ?? []).map((c) => c.name);
  const batches: ScriptScene[][] = [];
  for (let i = 0; i < targets.length; i += SCENES_PER_CALL) batches.push(targets.slice(i, i + SCENES_PER_CALL));
  const results: EnrichShotsOutput["shots"] = [];
  for (let i = 0; i < batches.length; i += PARALLEL_CALLS) {
    const outputs = await Promise.all(
      batches.slice(i, i + PARALLEL_CALLS).map((scenes) =>
        runTask(enrichShotsTask, { scenes, rosterNames, provider, model: req.model, effort: req.effort }, ctx),
      ),
    );
    for (const output of outputs) results.push(...output.shots);
  }
  results.sort((a, b) => a.scene - b.scene || a.shot - b.shot);

  // Pack the icons into sheets, in screen order; each sheet lives in the scene of its first icon.
  const stickerCount = results.reduce((n, r) => n + r.stickers.length, 0);
  const sheetCount = Math.ceil(stickerCount / MAX_PER_SHEET);
  const perSheet = sheetCount > 0 ? Math.ceil(stickerCount / sheetCount) : 0;
  const sheets: { id: string; scene: number; shot: number; labels: string[] }[] = [];
  const shotStickers = new Map<string, ShotSticker[]>();
  for (const result of results) {
    for (const label of result.stickers) {
      let sheet = sheets.at(-1);
      if (!sheet || sheet.labels.length >= perSheet) {
        sheet = { id: randomUUID(), scene: result.scene, shot: result.shot, labels: [] };
        sheets.push(sheet);
      }
      sheet.labels.push(label);
      const key = `${result.scene}:${result.shot}`;
      shotStickers.set(key, [...(shotStickers.get(key) ?? []), { sheetAssetId: sheet.id, cell: sheet.labels.length, label }]);
    }
  }
  const callouts = new Map(results.filter((r) => r.callouts.length).map((r) => [`${r.scene}:${r.shot}`, r.callouts]));

  const scenes = cleaned.map((scene) => {
    if (!inRange(scene)) return scene;
    const newSheets: RequiredAsset[] = sheets
      .filter((sheet) => sheet.scene === scene.index)
      .map((sheet) => ({
        id: sheet.id,
        type: "image",
        source: "generate",
        layer: "cutout",
        shot: sheet.shot,
        description: sheetDescription(sheet.labels),
        placement: "Không đặt nguyên tấm — bộ dựng cắt từng ô thành sticker riêng và cho bật ra cạnh người dẫn.",
      }));
    // Real photos: a print on the side away from the shot's speaker, to research (not generate).
    const photos: RequiredAsset[] = results
      .filter((r) => r.scene === scene.index)
      .flatMap((r) => {
        const speaker = scene.requiredAssets.find(
          (a) => a.shot === r.shot && a.layer === "cutout" && rosterNames.some((name) => a.description.includes(name)),
        );
        const side = speaker && parsePlacement(speaker.placement).x > 0 ? "bên trái" : "bên phải";
        return r.photos.map((photo) => ({
          id: randomUUID(),
          type: "image" as const,
          source: "stock" as const,
          layer: "cutout" as const,
          shot: r.shot,
          description: `Ảnh thật (bổ sung): ${photo}`,
          placement: `Như một tấm ảnh in đặt ${side} khung, chiếm khoảng 40% chiều rộng khung, nghiêng nhẹ.`,
        }));
      });
    return {
      ...scene,
      requiredAssets: [...scene.requiredAssets, ...newSheets, ...photos],
      shots: scene.shots?.map((shot) => {
        const key = `${scene.index}:${shot.order}`;
        return {
          ...shot,
          ...(shotStickers.has(key) ? { stickers: shotStickers.get(key) } : {}),
          ...(callouts.has(key) ? { callouts: callouts.get(key) } : {}),
        };
      }),
    };
  });
  const version = updateAnalyzedScenes(caller.id, admin, base.id, scenes) ?? base;
  clearSceneResources(req.videoId, oldSheets.map((asset) => asset.id));
  return {
    version,
    sheets: sheets.length,
    stickers: stickerCount,
    photos: results.reduce((n, r) => n + r.photos.length, 0),
    callouts: [...callouts.values()].reduce((n, list) => n + list.length, 0),
  };
}
