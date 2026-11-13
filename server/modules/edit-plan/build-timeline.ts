import { DEFAULT_FRAME_RATIO } from "../../../shared/frame-ratio.js";
import type { EditPlanResponse, EditPlanScene, EditPlanWarning } from "../../../shared/edit-plan.js";
import {
  DEFAULT_SUBTITLE_STYLE,
  IDENTITY_TRANSFORM,
  TIMELINE_CANVAS,
  TIMELINE_VERSION,
  type ClipTransform,
  type SubtitleCue,
  type Timeline,
  type TimelineMedia,
  type VisualClip,
} from "../../../shared/timeline.js";
import type { RequiredAsset, SceneResource, SceneShot, ScriptAnalysisRecord, User } from "../../../shared/types.js";
import { probeMedia } from "../../services/capcut/probe.js";
import { getVideo } from "../../services/db/videos-repo.js";
import { getTemplateById } from "../../services/db/style-templates-repo.js";
import { DEFAULT_EDIT_RECIPE, type EditRecipe, type RevealAnimation } from "../../../shared/edit-recipe.js";
import { getFileForUser, saveFile } from "../../services/storage/files.js";
import { listSceneResources, setSceneResource } from "../assets/repo.js";
import { getScriptAnalysisById, listVersionsForVideo } from "../script/repo.js";
import {
  animateLayer,
  avoidOverlap,
  badCoverFit,
  cameraKnots,
  driftKnots,
  fitInside,
  halfExtents,
  parsePlacement,
  placementScale,
  screenArea,
  type LayerIntro,
} from "./layout.js";
import { gridFromDescription, gridFromImage, isSpriteSheet, spriteFrames } from "./sprites.js";

type Caller = Pick<User, "id" | "role">;

/** Only these scenes (inclusive, by `index`); either end open. The timeline starts at the first one. */
export interface SceneRange {
  fromScene?: number;
  toScene?: number;
}

/** A subtitle line longer than this is split (at a comma, else a space). */
const MAX_SUBTITLE_CHARS = 80;
const FPS = 30;

interface LocalImage {
  fileId: string;
  path: string;
  width: number;
  height: number;
}

/** A picture as the timeline uses it: one still, or a sprite sheet's frames (all the same size). */
interface Media {
  paths: string[];
  width: number;
  height: number;
}

/** A character cut off at the waist/chest/shoulders (its cut edge belongs on the frame's bottom). */
const BUST_SHOT = /cận|trung cảnh|bán thân|đầu (?:và )?vai|ngang (?:ngực|hông|vai)|từ (?:hông|ngực|vai|eo) trở lên|cắt (?:ngang|ở) (?:ngực|hông|eo|vai)/i;
/** Smallest height (share of the frame) a full-figure character is shown at. */
const MIN_FIGURE_HEIGHT = 0.35;

/** Shots that would hold perfectly still at least this long get the recipe's slow drift. */
const HOLD_DRIFT_FROM_MS = 2500;
/** Talking/idle animations loop for the whole shot; other sprite sheets are one-off actions. */
const LOOPING_SPRITE = /khẩu hình|đang nói|nói chuyện|chớp mắt|lặp lại|vòng lặp|thở|nhún|gật gù|lắc lư|idle|loop/i;
/** A looping sprite is cut into at most this many clips per shot (slower frames beyond). */
const MAX_LOOP_CLIPS = 60;

/**
 * When each frame of a sprite shows within [from, to) of its shot. A one-off
 * action plays at the recipe's pace (faster if it wouldn't fit in 70% of the
 * time left) and holds its last frame; a loop repeats until the shot ends.
 */
export function spriteSchedule(
  count: number,
  from: number,
  to: number,
  frameMs: number,
  loop: boolean,
): { frame: number; from: number; to: number }[] {
  const span = to - from;
  if (span <= 0) return [];
  if (count <= 1) return [{ frame: 0, from, to }];
  const slots: { frame: number; from: number; to: number }[] = [];
  if (!loop) {
    const step = Math.max(40, Math.min(frameMs, Math.floor((span * 0.7) / count)));
    for (let k = 0; k < count; k++) {
      const start = from + k * step;
      const end = k === count - 1 ? to : from + (k + 1) * step;
      if (end > start) slots.push({ frame: k, from: start, to: end });
    }
    return slots;
  }
  const step = Math.max(frameMs, Math.ceil(span / MAX_LOOP_CLIPS));
  for (let t = from, k = 0; t < to; t += step, k++) slots.push({ frame: k % count, from: t, to: Math.min(to, t + step) });
  return slots;
}

/** The analyzed version a video works from (its pointer, else the newest analyzed one). */
function workingVersion(caller: Caller, videoId: string, versionId: string | undefined): ScriptAnalysisRecord | null {
  const admin = caller.role === "admin";
  const pointed = versionId ? getScriptAnalysisById(caller.id, admin, versionId) : null;
  if (pointed?.kind === "analyzed") return pointed;
  return listVersionsForVideo(caller.id, admin, videoId).find((v) => v.kind === "analyzed" && v.scenes.length > 0) ?? null;
}

/** A scene without a shot breakdown is one shot in the scene's own framing. */
function shotsOf(scene: ScriptAnalysisRecord["scenes"][number]): SceneShot[] {
  if (scene.shots?.length) return scene.shots;
  return [
    {
      order: 1,
      shotSize: scene.shotSize,
      angle: "eyeLevel",
      cameraMovement: scene.cameraMovement,
      subject: "",
      purpose: "",
      durationSec: scene.estimatedDurationSec,
    },
  ];
}

/** Narration split into subtitle lines: sentences, long ones cut at a comma or space. */
export function subtitleLines(narration: string): string[] {
  const sentences = narration
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > MAX_SUBTITLE_CHARS) {
      const window = rest.slice(0, MAX_SUBTITLE_CHARS);
      const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
      const at = cut > MAX_SUBTITLE_CHARS / 2 ? cut + 1 : MAX_SUBTITLE_CHARS;
      lines.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) lines.push(rest);
  }
  return lines;
}

/**
 * Lays a video's working script version out as a renderer-neutral Timeline:
 * scene by scene, shot by shot — the shot's background (layer 0) with its
 * cutouts stacked above, sprite sheets played frame by frame, every layer
 * moved by the shot's camera together, subtitles from the narration.
 *
 * Without a voiceover yet, every shot lasts its planned `durationSec`
 * (`estimatedTiming`). Picks that still point at a remote URL are downloaded
 * into Sunbee's storage once (and the pick updated), so the timeline only
 * ever references local files.
 */
export async function buildEditPlan(
  caller: Caller,
  videoId: string,
  range: SceneRange = {},
): Promise<EditPlanResponse> {
  const admin = caller.role === "admin";
  const video = getVideo(caller.id, admin, videoId);
  if (!video) throw new Error("Không tìm thấy video.");
  const version = workingVersion(caller, videoId, video.scriptVersionId);
  if (!version) throw new Error("Video chưa có kịch bản đã phân tích.");

  // The editing skill the plan follows: the video's own pick, else the one its script was analyzed with.
  const editSkillId = video.editSkillId ?? version.editingStyleTemplateId;
  const editSkill = editSkillId ? getTemplateById(caller.id, admin, editSkillId) : null;
  const recipe: EditRecipe =
    editSkill?.type === "editing" && editSkill.editRecipe ? editSkill.editRecipe : DEFAULT_EDIT_RECIPE;
  const introOf = (animation: RevealAnimation, durationMs: number): LayerIntro | undefined =>
    animation === "none" || durationMs <= 0 ? undefined : { kind: animation, durationMs };

  const ratio = video.frameRatio ?? DEFAULT_FRAME_RATIO;
  const canvas = { ratio, ...TIMELINE_CANVAS[ratio], fps: FPS };
  const picks = new Map(listSceneResources(videoId).map((pick) => [pick.assetId, pick]));
  const warnings: EditPlanWarning[] = [];
  const media = new Map<string, TimelineMedia>();
  const visual: VisualClip[] = [];
  const subtitles: SubtitleCue[] = [];
  const scenes: EditPlanScene[] = [];
  const images = new Map<string, LocalImage | null>();

  const mediaFor = (path: string, size: { width: number; height: number }, hasAlpha: boolean): string => {
    const existing = media.get(path);
    if (existing) return existing.id;
    const id = `m${media.size + 1}`;
    media.set(path, { id, kind: "image", path, width: size.width, height: size.height, hasAlpha });
    return id;
  };

  /** The pick's file on disk (downloading a remote pick into storage first). */
  const localImageOf = async (pick: SceneResource, sceneIndex: number): Promise<LocalImage | null> => {
    if (images.has(pick.assetId)) return images.get(pick.assetId)!;
    let file: { id: string; absolutePath: string } | null = null;
    const local = /^\/api\/files\/([^/?#]+)$/.exec(pick.candidate.url);
    if (local) file = getFileForUser(caller.id, admin, local[1]!);
    else if (pick.candidate.mediaType === "image") {
      try {
        const response = await fetch(pick.candidate.url);
        const mime = response.headers.get("content-type") ?? "";
        if (!response.ok || !mime.startsWith("image/")) throw new Error(`HTTP ${response.status} ${mime}`);
        const stored = await saveFile(caller.id, "asset", Buffer.from(await response.arrayBuffer()), pick.candidate.title || "image", mime);
        const url = `/api/files/${stored.id}`;
        // From now on the pick is our own copy — no second download, no link rot.
        setSceneResource(caller.id, {
          videoId,
          assetId: pick.assetId,
          assetDescription: pick.assetDescription,
          candidate: { ...pick.candidate, url, previewUrl: url },
        });
        file = getFileForUser(caller.id, admin, stored.id);
      } catch (err) {
        warnings.push({ code: "downloadFailed", sceneIndex, detail: `${pick.candidate.url} (${err instanceof Error ? err.message : String(err)})` });
      }
    }
    let result: LocalImage | null = null;
    if (file) {
      const size = await probeMedia(file.absolutePath);
      if (size.width && size.height) result = { fileId: file.id, path: file.absolutePath, width: size.width, height: size.height };
    }
    images.set(pick.assetId, result);
    return result;
  };

  /** A pick as timeline media: its frames when it's a sprite sheet (grid from its description, else read off the image). */
  const mediaOf = async (asset: RequiredAsset, image: LocalImage, sceneIndex: number, shotOrder: number): Promise<Media> => {
    if (isSpriteSheet(asset.description)) {
      const grid = gridFromDescription(asset.description) ?? (await gridFromImage(image.path, image.width, image.height));
      if (grid) return spriteFrames({ ...image, cacheKey: image.fileId }, grid);
      warnings.push({ code: "spriteGrid", sceneIndex, shotOrder, detail: asset.description });
    }
    return { paths: [image.path], width: image.width, height: image.height };
  };

  // Who the story's characters are: a shot's character is its main subject.
  const characterNames = (version.characterRoster ?? []).map((c) => c.name.toLowerCase()).filter(Boolean);
  const isCharacter = (asset: RequiredAsset) =>
    asset.type !== "graphic" &&
    (characterNames.some((name) => asset.description.toLowerCase().includes(name)) ||
      /người dẫn|nhân vật/i.test(asset.description));

  let cursor = 0;
  let missingNarration = 0;
  const inRange = version.scenes.filter(
    (scene) => scene.index >= (range.fromScene ?? -Infinity) && scene.index <= (range.toScene ?? Infinity),
  );

  for (const scene of inRange) {
    const sceneStart = cursor;
    // A shot without its own background keeps the one before it — within the
    // scene only, so a scene still missing its pictures shows as missing.
    let lastBackground: Media | null = null;
    let lastShot: { asset: RequiredAsset; media: Media }[] | null = null;
    const shots = shotsOf(scene);
    const shotOrders = new Set(shots.map((shot) => shot.order));
    for (const asset of scene.requiredAssets) {
      if (asset.type === "audio" || asset.type === "video") {
        warnings.push({ code: "skippedMedia", sceneIndex: scene.index, detail: asset.description });
      }
    }
    const imageAssets = scene.requiredAssets.filter((a) => a.type === "image" || a.type === "graphic");
    let placed = 0;
    const fallbackShotMs = Math.max(1000, Math.round((scene.estimatedDurationSec * 1000) / shots.length));

    for (const shot of shots) {
      const durationMs = shot.durationSec > 0 ? Math.round(shot.durationSec * 1000) : fallbackShotMs;
      // Images not tied to an existing shot count for every shot of the scene.
      const own = imageAssets.filter((a) => a.shot === shot.order || !a.shot || !shotOrders.has(a.shot));
      // A shot with no pictures of its own continues the previous shot's picture —
      // its whole point is the camera move ("đẩy máy vào…"), so that move plays
      // even under a locked-off recipe.
      const carried = own.length === 0 && lastShot !== null;
      const moving =
        recipe.camera.motion === "none" && !carried
          ? []
          : cameraKnots(
              shot.cameraMovement,
              durationMs,
              scene.index + shot.order,
              recipe.camera.motion === "none" ? 1 : recipe.camera.intensity,
            );
      // A locked-off shot that holds for a while drifts in slowly, so it never looks frozen.
      const knots =
        moving.length === 0 && recipe.camera.holdDrift > 0 && durationMs >= HOLD_DRIFT_FROM_MS
          ? driftKnots(durationMs, recipe.camera.holdDrift)
          : moving;

      const resolved: { asset: RequiredAsset; media: Media }[] = [];
      for (const asset of own) {
        const pick = picks.get(asset.id);
        const image = pick ? await localImageOf(pick, scene.index) : null;
        if (!image) {
          warnings.push({ code: "missingPick", sceneIndex: scene.index, shotOrder: shot.order, detail: asset.description });
          continue;
        }
        resolved.push({ asset, media: await mediaOf(asset, image, scene.index, shot.order) });
      }
      // Carried over: already on screen, so no intros and sprites hold their last frame.
      if (carried) {
        for (const layer of lastShot!) resolved.push({ ...layer, media: { ...layer.media, paths: [layer.media.paths.at(-1)!] } });
      }
      if (resolved.length > 0) lastShot = resolved;

      /** Clips of one layer: a still, or a sprite's frames on their schedule (intro on the first). */
      const pushLayer = (
        id: string,
        media: Media,
        layer: number,
        role: VisualClip["role"],
        fit: VisualClip["fit"],
        base: ClipTransform,
        from: number,
        loop: boolean,
        intro?: LayerIntro,
      ) => {
        spriteSchedule(media.paths.length, from, durationMs, recipe.sprite.frameMs, loop).forEach((slot, k) => {
          visual.push({
            id: `${id}-${k + 1}`,
            mediaId: mediaFor(media.paths[slot.frame]!, media, role === "cutout"),
            role,
            layer,
            fit,
            startMs: cursor + slot.from,
            durationMs: slot.to - slot.from,
            ...animateLayer(knots, base, slot.from, slot.to, k === 0 ? intro : undefined),
            origin: { sceneIndex: scene.index, shotOrder: shot.order },
          });
        });
      };

      // ---- background (layer 0): the shot's own, else the one already on screen ----
      // A frame far from the canvas' shape (a 3:1 strip) would be cut apart by
      // cropping to cover: it goes on top of the background on screen instead,
      // whole — or, with nothing under it, fitted inside the frame.
      const frame = resolved.find((r) => r.asset.layer !== "cutout") ?? null;
      const misshapen = frame !== null && badCoverFit(frame.media, canvas);
      const insert = misshapen && lastBackground ? frame : null;
      const background: Media | null = (misshapen ? lastBackground : frame?.media) ?? lastBackground ?? frame?.media ?? null;
      if (frame) placed++;
      if (background) {
        const loop = frame !== null && frame.media === background && LOOPING_SPRITE.test(frame.asset.description);
        const fit = misshapen && !insert ? "contain" : "cover";
        pushLayer(`s${scene.index}-${shot.order}-bg`, background, 0, "background", fit, IDENTITY_TRANSFORM, 0, loop);
        // What stays on screen for the next shot: a sprite's last frame.
        if (background !== lastBackground) lastBackground = { ...background, paths: [background.paths.at(-1)!] };
      } else {
        warnings.push({ code: "noBackground", sceneIndex: scene.index, shotOrder: shot.order });
      }
      if (insert) {
        const base = fitInside({ ...IDENTITY_TRANSFORM, scale: 0.92 }, insert.media, canvas);
        const loop = LOOPING_SPRITE.test(insert.asset.description);
        pushLayer(`s${scene.index}-${shot.order}-insert`, insert.media, 1, "cutout", "contain", base, 0, loop);
      }

      // ---- cutouts (layers above), placed from their placement, kept apart and inside the frame ----
      const cutouts = resolved.filter((r) => r.asset.layer === "cutout");
      const placedBases: ClipTransform[] = [];
      const pinned: boolean[] = [];
      for (const { asset, media } of cutouts) {
        const parsed = parsePlacement(asset.placement);
        // A line of text with no size given: a readable share of the width, not a
        // height share (a wide text strip sized by height fills the frame).
        let placement =
          asset.type === "graphic" && !parsed.sized ? { ...parsed, size: 0.4, axis: "width" as const } : parsed;
        // A full-figure character smaller than ~a third of the frame reads as a speck.
        const character = isCharacter(asset);
        const bust = character && BUST_SHOT.test(`${asset.description} ${asset.placement ?? ""}`);
        if (character && !bust && placement.axis === "height" && placement.size < MIN_FIGURE_HEIGHT) {
          placement = { ...placement, size: MIN_FIGURE_HEIGHT };
        }
        let base = fitInside(
          { ...IDENTITY_TRANSFORM, x: placement.x, y: placement.y, scale: placementScale(placement, media, canvas) },
          media,
          canvas,
        );
        // A character cut off at the waist/chest stands on the bottom edge — never
        // a half body floating mid-frame.
        if (bust) {
          // Its cut edge bleeds 1% past the bottom, so no sliver of background shows under it.
          const box = halfExtents(base, media, canvas);
          base = { ...base, y: Math.round((1 - box.hh + 0.01) * 10000) / 10000 };
        }
        // "dưới dòng “X”": right under that line, in its column.
        const refIndex = placement.below
          ? cutouts.findIndex((c, j) => j < placedBases.length && c.asset.description.toLowerCase().includes(placement.below!))
          : -1;
        if (refIndex >= 0) {
          const ref = placedBases[refIndex]!;
          const refBox = halfExtents(ref, cutouts[refIndex]!.media, canvas);
          const box = halfExtents(base, media, canvas);
          base = fitInside(
            {
              ...base,
              y: ref.y + refBox.hh + box.hh + 0.03,
              x: placement.alignLeft ? ref.x - refBox.hw + box.hw : base.x,
            },
            media,
            canvas,
          );
        }
        placedBases.push(base);
        pinned.push(refIndex >= 0);
      }
      const bases = avoidOverlap(
        cutouts.map(({ media }, i) => ({ base: placedBases[i]!, size: media, pinned: pinned[i] })),
        canvas,
      );
      // When each comes on: all at the cut, or — built up — the main subject (the
      // largest) at the cut so the frame is never empty, the rest one after
      // another over the first ~60% of the shot, in the order they're listed.
      const lead = Math.min(recipe.reveal.leadMs, Math.max(0, durationMs - 100));
      // The main subject — the shot's character, else its largest picture (never a
      // line of text) — is there at the cut; the rest follow in listed order.
      const area = (i: number) => screenArea(bases[i]!, cutouts[i]!.media, canvas);
      const pictures = cutouts.map((_, i) => i).filter((i) => cutouts[i]!.asset.type !== "graphic");
      const character = cutouts.findIndex((c) => isCharacter(c.asset));
      const main =
        character >= 0 ? character : pictures.reduce((best, i) => (best < 0 || area(i) > area(best) ? i : best), -1);
      const rest = cutouts.map((_, i) => i).filter((i) => i !== main);
      const offset = main >= 0 ? 1 : 0;
      // The frame is never empty: the main subject (or, in a text-only shot, its
      // first line) is fully there from the cut's first frame — no pop, no fade.
      const anchor = main >= 0 ? main : 0;
      const appearAt = (i: number) =>
        carried || i === anchor
          ? 0
          : recipe.reveal.mode !== "sequential"
            ? lead
            : Math.round(
              lead + (Math.max(0, durationMs * 0.6 - lead) * (rest.indexOf(i) + offset)) / (rest.length + offset),
            );
      for (const [i, { asset, media }] of cutouts.entries()) {
        placed++;
        const intro =
          carried || i === anchor
            ? undefined
          : asset.type === "graphic"
            ? introOf(recipe.text.animation, recipe.text.durationMs)
            : introOf(recipe.reveal.animation, recipe.reveal.durationMs);
        pushLayer(
          `s${scene.index}-${shot.order}-c${i + 1}`,
          media,
          i + 1 + (insert ? 1 : 0),
          "cutout",
          "contain",
          bases[i]!,
          appearAt(i),
          LOOPING_SPRITE.test(asset.description),
          intro,
        );
      }
      cursor += durationMs;
    }

    // ---- subtitles: the narration, timed by length across the scene ----
    const sceneMs = cursor - sceneStart;
    if (scene.narration === undefined) missingNarration++;
    const lines = recipe.subtitles.enabled ? subtitleLines(scene.narration ?? "") : [];
    const totalChars = lines.reduce((n, line) => n + line.length, 0);
    let at = sceneStart;
    lines.forEach((text, i) => {
      const end = i === lines.length - 1 ? cursor : at + Math.round((sceneMs * text.length) / totalChars);
      if (end > at) subtitles.push({ id: `t${scene.index}-${i + 1}`, startMs: at, durationMs: end - at, text, origin: { sceneIndex: scene.index } });
      at = end;
    });

    scenes.push({
      sceneIndex: scene.index,
      startMs: sceneStart,
      durationMs: sceneMs,
      shots: shots.length,
      images: placed,
      imagesWanted: imageAssets.length,
      subtitles: lines.length,
    });
  }
  if (missingNarration > 0) warnings.push({ code: "noNarration", detail: String(missingNarration) });

  const timeline: Timeline = {
    version: TIMELINE_VERSION,
    videoId,
    name: video.name,
    canvas,
    durationMs: cursor,
    media: [...media.values()],
    visual,
    audio: [],
    subtitles,
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  };
  // An asset without a shot is checked once per shot: report each problem once.
  const unique = [...new Map(warnings.map((w) => [`${w.code}|${w.sceneIndex}|${w.detail}`, w])).values()];
  return {
    timeline,
    scenes,
    warnings: unique,
    estimatedTiming: true,
    editSkill: editSkill?.type === "editing" ? { id: editSkill.id, name: editSkill.name } : null,
    recipe,
  };
}
