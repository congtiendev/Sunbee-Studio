import { DEFAULT_FRAME_RATIO } from "../../../shared/frame-ratio.js";
import type { EditPlanResponse, EditPlanScene, EditPlanWarning } from "../../../shared/edit-plan.js";
import {
  DEFAULT_SUBTITLE_STYLE,
  IDENTITY_TRANSFORM,
  TIMELINE_CANVAS,
  TIMELINE_VERSION,
  type AudioClip,
  type CapcutRef,
  type ClipTransform,
  type SubtitleCue,
  type TextClip,
  type Timeline,
  type TimelineMedia,
  type VisualClip,
} from "../../../shared/timeline.js";
import { isEditorText, isRealPhoto } from "../../../shared/types.js";
import type { RequiredAsset, SceneResource, SceneShot, ScriptAnalysisRecord, User } from "../../../shared/types.js";
import { capcutRef } from "../../services/capcut/lookup.js";
import { probeMedia } from "../../services/capcut/probe.js";
import { getVideo } from "../../services/db/videos-repo.js";
import { getTemplateById } from "../../services/db/style-templates-repo.js";
import { DEFAULT_EDIT_RECIPE, type EditRecipe, type RevealAnimation } from "../../../shared/edit-recipe.js";
import { getFileForUser, saveFile } from "../../services/storage/files.js";
import { listSceneResources, searchLibrary, setSceneResource } from "../assets/repo.js";
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
  TEXT_SAFE_EDGE,
  type LayerIntro,
} from "./layout.js";
import { isStickerSheet } from "../assets/enrich.js";
import {
  gridFromDescription,
  gridFromImage,
  isSpriteSheet,
  photoCard,
  spriteFrames,
  stickerCells,
  type CutSides,
} from "./sprites.js";

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
  /** Ends in a cut along its bottom row (a bust, a hand from below): it belongs on the frame's bottom edge. */
  cutBottom?: boolean;
  /** Sides drawn as a straight cut (read off the pixels): each belongs on that edge of the frame. */
  cut?: CutSides;
  /** A real photo framed as a print (white border): it leans a little when placed. */
  photo?: boolean;
  /** Editor text (no picture): the words and look; width/height are its box at a 100 px text size. */
  text?: { value: string; align: "left" | "center"; color: string; stroke: string };
}

/** Rough share of the text size one character takes across (bold sans). */
const CHAR_WIDTH = 0.55;
const LINE_HEIGHT = 1.3;

/** The colour a text graphic's description asks for, and an outline that reads against it. */
function textColours(description: string): { color: string; stroke: string } {
  const d = description.toLowerCase();
  const pick = (color: string, stroke = "#ffffff") => ({ color, stroke });
  if (/nâu đỏ|đỏ đậm|đỏ sẫm|đỏ đô|đỏ rượu/.test(d)) return pick("#8b1a1a");
  if (/chữ (?:màu )?trắng|màu trắng/.test(d)) return pick("#ffffff", "#2b1d14");
  if (/vàng/.test(d)) return pick("#f2b705", "#2b1d14");
  if (/đỏ/.test(d)) return pick("#d62828");
  if (/xanh dương|xanh lam|xanh nước biển/.test(d)) return pick("#1f4e9c");
  if (/xanh lá|xanh lục/.test(d)) return pick("#2e7d32");
  if (/đen|nâu sẫm|nâu đen/.test(d)) return pick("#2b1d14");
  if (/nâu/.test(d)) return pick("#5a3a22");
  return pick("#8b1a1a");
}

/** Editor text as layout media: a box the size the words take at 100 px. */
function textMedia(asset: RequiredAsset): Media {
  const value = asset.text!.trim();
  const lines = value.split("\n");
  const longest = Math.max(...lines.map((line) => Array.from(line).length), 1);
  const list = lines.length > 1 && lines.some((line) => /^\s*[•\-–*·\d]/.test(line));
  const align = list || /căn (?:lề )?trái/i.test(`${asset.description} ${asset.placement ?? ""}`) ? "left" : "center";
  return {
    paths: [],
    width: Math.round(longest * CHAR_WIDTH * 100),
    height: Math.round(lines.length * LINE_HEIGHT * 100),
    text: { value, align, ...textColours(asset.description) },
  };
}

/** Real photos placed as cutouts lean a little, like a print laid on the page. */
const PHOTO_TILT = [-3, 2.5, -2, 3];

/** A character cut off at the waist/chest/shoulders (its cut edge belongs on the frame's bottom). */
// ("cầm điện thoại ngang ngực" is where a hand is, not where the picture is cut.)
const BUST_SHOT =
  /cận|trung cảnh|bán thân|đầu (?:và )?vai|(?:cảnh|cắt|khung) ngang (?:ngực|hông|vai)|từ (?:hông|ngực|vai|eo) trở lên|cắt (?:ngang|ở) (?:ngực|hông|eo|vai)/i;
/** Smallest height (share of the frame) a full-figure character is shown at. */
const MIN_FIGURE_HEIGHT = 0.45;
/** Smallest height of a shot's character by how close the shot is: a close-up's face fills the frame. */
const MIN_CHARACTER_HEIGHT: Partial<Record<SceneShot["shotSize"], number>> = { extremeCloseUp: 0.8, closeUp: 0.7, medium: 0.55 };
/** "nhịp 2/3": one beat of a subject's action split over several sprite sheets, played one after another in one spot. */
const BEAT = /nhịp\s*(\d+)\s*\/\s*(\d+)/i;
/** The video's very first shot, when it has nothing but a background, is cut to this (the hook can't wait). */
const HOOK_EMPTY_MAX_MS = 800;
/** What makes a hero moment worth a hit (shake + impact): something happens on screen. */
const ACTION =
  /quát|hét|gào|sốc|giật mình|choáng|sững sờ|trợn|há hốc|đập|ngã|nổ|hoảng|bật dậy|tát|đấm|văng|sụp|vỡ|rời nhóm|bị (?:lộ|lật tẩy)|bùng/i;
/** Sound effects shorter than this are clicks nobody hears under a voice; a category's longer ones are used when it has a few. */
const MIN_SFX_MS = 150;

/**
 * What an element sounds like when it comes on, from what it is — the
 * library's sound-effect pack categories. First match wins; most elements
 * (characters, text lines) match nothing and stay silent.
 */
const SMART_SFX: [RegExp, string][] = [
  [/thông báo|notification|tin nhắn mới|màn hình (?:điện thoại )?sáng/i, "notifications"],
  [/chuông điện thoại|cuộc gọi|đổ chuông/i, "phone"],
  [/bóng đèn|ý tưởng|lóe sáng|lấp lánh|tia sáng/i, "shimmers"],
  [/khoanh (?:tròn|đỏ)|vòng tròn đỏ|gạch chân|đánh dấu bằng bút/i, "writing-and-drawing"],
  [/gõ phím|bàn phím|đánh máy/i, "keyboard"],
  [/tiền|đồng xu|ví tiền|hoá đơn|chuyển khoản/i, "money"],
  [/đồng hồ|tích tắc|hẹn giờ/i, "time"],
  [/bong bóng (?:chat|bình luận|lời thoại)|biểu tượng cảm xúc|emoji/i, "pops"],
  [/rời nhóm|đã rời|bị (?:kick|xoá khỏi)|tin nhắn (?:mới|đến)|tích xanh|dấu x đỏ/i, "notifications"],
  [/đã xem|lượt xem|đếm (?:ngược|lùi)|giảm dần|tăng dần|con số (?:nhảy|tăng|giảm)|biểu đồ|thanh tiến trình/i, "data"],
  [/lật (?:hồ sơ|trang|tờ|giấy)|xấp (?:giấy|hồ sơ)|tập hồ sơ/i, "everyday-props"],
  [/quát|hét|đập bàn|giật mình|choáng|sốc|ngã|nổ tung|sụp/i, "impacts"],
];
/** A sticker's size: a share of the frame's height (or width, for a wide one). */
const STICKER_HEIGHT = 0.26;
const STICKER_WIDTH = 0.28;
/** Stickers lean a little, like stuck on. */
const STICKER_TILT = [-6, 5, -4, 7];
/** Pop-up key words: dark red with a white outline (readable on paper and photos alike). */
const CALLOUT_STYLE: TextClip["style"] = { size: 0.075, bold: true, color: "#8b1a1a", strokeColor: "#ffffff", strokeWidth: 0.14 };
const CALLOUT_MAX_WIDTH = 0.42;

/** Hero-moment hits (effect + sound) at most once per this long. */
const HERO_MIN_GAP_MS = 30_000;
/** Sound effects never closer than this. */
const SFX_MIN_GAP_MS = 1200;
/** A sound effect is cut to at most this long (they're accents, not beds). */
const SFX_MAX_MS = 2500;

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

/** A beat of a multi-beat action ("nhịp 2/3" → { k: 2, n: 3 }), or null. */
function beatOf(asset: RequiredAsset): { k: number; n: number } | null {
  const match = BEAT.exec(asset.description);
  if (!match) return null;
  const k = Number(match[1]);
  const n = Number(match[2]);
  return k >= 1 && n >= 2 && k <= n ? { k, n } : null;
}

/** The words an element shows or is described by, lower-cased — what "dưới/bên phải dòng “X”" refers to. */
function wordsOf(asset: RequiredAsset): string {
  return `${asset.text ?? ""} ${asset.description}`.normalize("NFC").toLowerCase();
}

/** Words compared as the same line of text: case, quotes and spacing aside. */
function normalizedWords(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
}

/** The words a text graphic shows — between its outermost quotes — normalized; null when it quotes nothing. */
function quotedText(description: string): string | null {
  const open = description.search(/[“"]/);
  const close = Math.max(description.lastIndexOf("”"), description.lastIndexOf('"'));
  if (open < 0 || close <= open + 1) return null;
  const words = description
    .slice(open + 1, close)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return words.length >= 6 ? words : null;
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
  const texts: TextClip[] = [];
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

  /** What the words say about a cutout's subject, for cutting its frames. */
  const hintsOf = (asset: RequiredAsset) => {
    const character = asset.layer === "cutout" && isCharacter(asset);
    return { character, bust: character && BUST_SHOT.test(`${asset.description} ${asset.placement ?? ""}`) };
  };

  /** A pick as timeline media: its frames when it's a sprite sheet (grid from its description, else read off the image). */
  const mediaOf = async (asset: RequiredAsset, image: LocalImage, sceneIndex: number, shotOrder: number): Promise<Media> => {
    if (isSpriteSheet(asset.description)) {
      const grid = gridFromDescription(asset.description) ?? (await gridFromImage(image.path, image.width, image.height));
      if (grid) return spriteFrames({ ...image, cacheKey: image.fileId }, grid, hintsOf(asset));
      warnings.push({ code: "spriteGrid", sceneIndex, shotOrder, detail: asset.description });
    }
    // A real photo laid over the frame: a print with a white border.
    if (asset.layer === "cutout" && isRealPhoto(asset)) {
      const card = await photoCard({ ...image, cacheKey: image.fileId });
      if (card) return { paths: [card.path], width: card.width, height: card.height, photo: true };
    }
    // A cutout picture: cropped to what's drawn, and checked for cut edges.
    if (asset.layer === "cutout") {
      return spriteFrames({ ...image, cacheKey: image.fileId }, { cols: 1, rows: 1, frames: 1 }, hintsOf(asset));
    }
    return { paths: [image.path], width: image.width, height: image.height };
  };

  // Sticker sheets (from "enrich shots"), by asset id, wherever they live; cut into icons on first use.
  const sheetAssets = new Map(
    version.scenes.flatMap((scene) => scene.requiredAssets.filter(isStickerSheet).map((asset) => [asset.id, asset] as const)),
  );
  const sheetCells = new Map<string, ({ path: string; width: number; height: number } | null)[] | null>();
  const stickerOf = async (sheetId: string, cell: number, sceneIndex: number) => {
    if (!sheetCells.has(sheetId)) {
      const asset = sheetAssets.get(sheetId);
      const pick = asset ? picks.get(sheetId) : undefined;
      const image = pick ? await localImageOf(pick, sceneIndex) : null;
      const grid = asset ? gridFromDescription(asset.description) : null;
      if (asset && !image) warnings.push({ code: "missingPick", sceneIndex, detail: asset.description });
      sheetCells.set(sheetId, image && grid ? await stickerCells({ ...image, cacheKey: image.fileId }, grid) : null);
    }
    return sheetCells.get(sheetId)?.[cell - 1] ?? null;
  };

  // Who the story's characters are: a shot's character is its main subject.
  const characterNames = (version.characterRoster ?? []).map((c) => c.name.toLowerCase()).filter(Boolean);
  const isCharacter = (asset: RequiredAsset) =>
    asset.type !== "graphic" &&
    (characterNames.some((name) => asset.description.toLowerCase().includes(name)) ||
      /người dẫn|nhân vật/i.test(asset.description));

  // CapCut built-ins the recipe asks for (null: not used / unknown key).
  // CapCut intros run for the recipe's reveal/text durations (snappy), not CapCut's 0.5 s default.
  const withMs = (ref: CapcutRef | null, ms: number) => (ref && ms > 0 ? { ...ref, durationMs: ms } : ref);
  const revealIntroRef = withMs(capcutRef(recipe.capcut.revealIntro), recipe.reveal.durationMs);
  const textIntroRef = withMs(capcutRef(recipe.capcut.textIntro), recipe.text.durationMs);
  const transitionRef = capcutRef(recipe.capcut.sceneTransition, 467);
  const heroEffectRef = capcutRef(recipe.capcut.heroEffect, recipe.capcut.heroEffectMs);
  const transitions: NonNullable<Timeline["transitions"]> = [];
  const effects: NonNullable<Timeline["effects"]> = [];
  /** Moments a sound effect could go, resolved to library sounds (and thinned out) at the end. */
  const sfxEvents: { atMs: number; category: string; priority: number }[] = [];
  let lastBackgroundClipId: string | null = null;
  /** The picture under the last background clip — a transition into the same picture is skipped. */
  let lastBackgroundPath: string | null = null;
  let lastTransitionAt = -Infinity;
  let lastHeroAt = -Infinity;

  let cursor = 0;
  let missingNarration = 0;
  const inRange = version.scenes.filter(
    (scene) => scene.index >= (range.fromScene ?? -Infinity) && scene.index <= (range.toScene ?? Infinity),
  );

  for (const scene of inRange) {
    const sceneStart = cursor;
    const firstScene = scene === inRange[0];
    // A transition into this scene — placed once its first background is known
    // (a flash between two shots of the same backdrop only looks like a glitch).
    let pendingTransition =
      !firstScene && transitionRef && lastBackgroundClipId && sceneStart - lastTransitionAt >= recipe.capcut.transitionMinGapSec * 1000
        ? { afterClipId: lastBackgroundClipId, fromPath: lastBackgroundPath }
        : null;
    if (!firstScene && recipe.sfx.enabled && recipe.sfx.sceneChange) {
      sfxEvents.push({ atMs: sceneStart, category: recipe.sfx.sceneChange, priority: 1 });
    }
    const shots = shotsOf(scene);
    // Hits stay rare (an analysis can mark many scenes as hero moments) and land
    // on the shot where something happens — a shake on a still frame is a glitch.
    const heroShot =
      scene.heroMoment && sceneStart - lastHeroAt >= HERO_MIN_GAP_MS
        ? (shots.find((shot) => ACTION.test(`${shot.subject} ${shot.purpose}`))?.order ?? null)
        : null;
    // A shot without its own background keeps the one before it — within the
    // scene only, so a scene still missing its pictures shows as missing.
    let lastBackground: Media | null = null;
    let lastShot: { asset: RequiredAsset; media: Media }[] | null = null;
    /** Text already on screen in this scene, by its words: the same line in the next shot stays put. */
    const shownText = new Map<string, ClipTransform>();
    /** Time cut from the opening shot, given to the next one. */
    let carryMs = 0;
    const shotOrders = new Set(shots.map((shot) => shot.order));
    for (const asset of scene.requiredAssets) {
      if (asset.type === "audio" || asset.type === "video") {
        warnings.push({ code: "skippedMedia", sceneIndex: scene.index, detail: asset.description });
      }
    }
    // (A sticker sheet isn't placed whole: its icons go where shots ask for them.)
    const imageAssets = scene.requiredAssets.filter(
      (a) => (a.type === "image" || a.type === "graphic") && !isStickerSheet(a),
    );
    let placed = 0;
    const fallbackShotMs = Math.max(1000, Math.round((scene.estimatedDurationSec * 1000) / shots.length));

    for (const shot of shots) {
      let durationMs = (shot.durationSec > 0 ? Math.round(shot.durationSec * 1000) : fallbackShotMs) + carryMs;
      carryMs = 0;
      // Images not tied to an existing shot count for every shot of the scene.
      const own = imageAssets.filter((a) => a.shot === shot.order || !a.shot || !shotOrders.has(a.shot));
      // The video opening on an empty establishing shot: cut it short, the hook can't wait.
      const opening = scene === version.scenes[0] && shot === shots[0] && shots.length > 1;
      if (opening && own.every((a) => a.layer !== "cutout") && durationMs > HOOK_EMPTY_MAX_MS) {
        carryMs = durationMs - HOOK_EMPTY_MAX_MS;
        durationMs = HOOK_EMPTY_MAX_MS;
      }
      if (shot.order === heroShot) {
        lastHeroAt = cursor;
        if (heroEffectRef) {
          effects.push({ id: `fx-${scene.index}`, startMs: cursor, durationMs: recipe.capcut.heroEffectMs, ref: heroEffectRef });
        }
        if (recipe.sfx.enabled && recipe.sfx.hero) sfxEvents.push({ atMs: cursor, category: recipe.sfx.hero, priority: 3 });
      }
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
        // Words the editor writes: no picture to find.
        if (isEditorText(asset)) {
          resolved.push({ asset, media: textMedia(asset) });
          continue;
        }
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
      if (resolved.length > 0) {
        lastShot = resolved.filter(({ asset }) => {
          const beat = beatOf(asset);
          return !beat || !resolved.some((other) => (beatOf(other.asset)?.k ?? 0) > beat.k);
        });
      }

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
        capcutIntro?: CapcutRef | null,
        to = durationMs,
      ) => {
        spriteSchedule(media.paths.length, from, to, recipe.sprite.frameMs, loop).forEach((slot, k) => {
          visual.push({
            id: `${id}-${k + 1}`,
            mediaId: mediaFor(media.paths[slot.frame]!, media, role === "cutout"),
            role,
            layer,
            fit,
            startMs: cursor + slot.from,
            durationMs: slot.to - slot.from,
            // A CapCut intro replaces the keyframed one; either plays on the first frame only.
            ...animateLayer(knots, base, slot.from, slot.to, k === 0 && !capcutIntro ? intro : undefined),
            ...(k === 0 && capcutIntro ? { capcutIntro } : {}),
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
        if (pendingTransition && background.paths[0] !== pendingTransition.fromPath) {
          transitions.push({ afterClipId: pendingTransition.afterClipId, ref: transitionRef! });
          lastTransitionAt = sceneStart;
          if (recipe.sfx.enabled && recipe.sfx.transition) {
            sfxEvents.push({ atMs: sceneStart, category: recipe.sfx.transition, priority: 2 });
          }
        }
        pendingTransition = null;
        pushLayer(`s${scene.index}-${shot.order}-bg`, background, 0, "background", fit, IDENTITY_TRANSFORM, 0, loop);
        lastBackgroundClipId = visual.at(-1)!.id;
        lastBackgroundPath = background.paths.at(-1)!;
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
      const layered = resolved.filter((r) => r.asset.layer === "cutout");
      // Beat 2+ of an action takes over from beat 1 in its spot (later in the
      // shot) instead of being placed beside it as a second figure.
      const firstBeats = new Set(layered.filter((r) => beatOf(r.asset)?.k === 1).map((r) => beatOf(r.asset)!.n));
      const isLaterBeat = (asset: RequiredAsset) => {
        const beat = beatOf(asset);
        return beat !== null && beat.k > 1 && firstBeats.has(beat.n);
      };
      const cutouts = layered.filter((r) => !isLaterBeat(r.asset));
      const laterBeats = layered.filter((r) => isLaterBeat(r.asset));
      const placedBases: ClipTransform[] = [];
      const pinned: boolean[] = [];
      const grounded: boolean[] = [];
      /** Text already shown in an earlier shot of the scene: same place and size, no second entrance. */
      const held: boolean[] = [];
      for (const { asset, media } of cutouts) {
        const words = asset.type === "graphic" ? (asset.text ? normalizedWords(asset.text) : quotedText(asset.description)) : null;
        const shown = words ? shownText.get(words) : undefined;
        if (shown) {
          placedBases.push(shown);
          pinned.push(true);
          grounded.push(false);
          held.push(true);
          continue;
        }
        held.push(false);
        const parsed = parsePlacement(asset.placement);
        // A line of text with no size given: a readable share of the width, not a
        // height share (a wide text strip sized by height fills the frame).
        let placement =
          asset.type === "graphic" && !parsed.sized ? { ...parsed, size: 0.4, axis: "width" as const } : parsed;
        // A full-figure character smaller than ~a third of the frame reads as a speck.
        const character = isCharacter(asset);
        // Cut off at the bottom — read off the picture itself, or from the words (its frames are cut to match).
        const bust = asset.type !== "graphic" && media.cutBottom === true;
        const minHeight = bust ? (MIN_CHARACTER_HEIGHT[shot.shotSize] ?? 0.4) : MIN_FIGURE_HEIGHT;
        if (character && placement.axis === "height" && placement.size < minHeight) {
          placement = { ...placement, size: minHeight };
        }
        const edge = asset.type === "graphic" ? TEXT_SAFE_EDGE : undefined;
        let base = fitInside(
          { ...IDENTITY_TRANSFORM, x: placement.x, y: placement.y, scale: placementScale(placement, media, canvas) },
          media,
          canvas,
          edge,
        );
        // RULE: anything cut off at the bottom (a character at the waist/chest, a
        // hand from below) has its cut ON the frame's bottom edge — never a half
        // body floating with background showing under it. The frames are cropped
        // so the cut is the picture's last row; it bleeds 1% past the edge.
        if (bust) {
          const box = halfExtents(base, media, canvas);
          base = { ...base, y: Math.round((1 - box.hh + 0.01) * 10000) / 10000 };
        }
        // The same for a cut at the top or a side (a face filling the frame from its left edge…).
        const sideCut = asset.type !== "graphic" && media.cut && (media.cut.top || media.cut.left || media.cut.right);
        if (sideCut) {
          const box = halfExtents(base, media, canvas);
          const edge = (half: number) => Math.round((1 - half + 0.01) * 10000) / 10000;
          base = {
            ...base,
            x: media.cut!.left ? -edge(box.hw) : media.cut!.right ? edge(box.hw) : base.x,
            y: media.cut!.top && !bust ? -edge(box.hh) : base.y,
          };
        }
        // "dưới dòng “X”": right under that line, in its column.
        const refIndex = placement.below
          ? cutouts.findIndex((c, j) => j < placedBases.length && wordsOf(c.asset).includes(placement.below!))
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
            edge,
          );
        }
        if (media.photo) base = { ...base, rotation: PHOTO_TILT[placedBases.length % PHOTO_TILT.length]! };
        placedBases.push(base);
        pinned.push(refIndex >= 0 || Boolean(sideCut));
        // A character standing on (or cut off at) the bottom edge stays on it when moved.
        const box = halfExtents(base, media, canvas);
        grounded.push(bust || (character && base.y + box.hh >= 0.9));
      }
      const bases = avoidOverlap(
        cutouts.map(({ asset, media }, i) => ({
          base: placedBases[i]!,
          size: media,
          pinned: pinned[i],
          grounded: grounded[i],
          edge: asset.type === "graphic" ? TEXT_SAFE_EDGE : undefined,
        })),
        canvas,
      );
      cutouts.forEach(({ asset }, i) => {
        const words = asset.type === "graphic" ? (asset.text ? normalizedWords(asset.text) : quotedText(asset.description)) : null;
        if (words) shownText.set(words, bases[i]!);
      });
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
        carried || i === anchor || held[i]
          ? 0
          : recipe.reveal.mode !== "sequential"
            ? lead
            : Math.round(
              lead + (Math.max(0, durationMs * 0.6 - lead) * (rest.indexOf(i) + offset)) / (rest.length + offset),
            );
      for (const [i, { asset, media }] of cutouts.entries()) {
        placed++;
        const intro =
          carried || i === anchor || held[i]
            ? undefined
          : asset.type === "graphic"
            ? introOf(recipe.text.animation, recipe.text.durationMs)
            : introOf(recipe.reveal.animation, recipe.reveal.durationMs);
        const fresh = !carried && i !== anchor && !held[i];
        // Editor text: CapCut's own text at the laid-out box's size.
        if (media.text) {
          const box = halfExtents(bases[i]!, media, canvas);
          const lines = media.text.value.split("\n").length;
          const size = Math.min(0.16, Math.max(0.035, box.hh / (lines * LINE_HEIGHT)));
          const start = appearAt(i);
          texts.push({
            id: `s${scene.index}-${shot.order}-c${i + 1}`,
            startMs: cursor + start,
            durationMs: durationMs - start,
            text: media.text.value,
            ...animateLayer(knots, { ...bases[i]!, scale: 1 }, start, durationMs, intro),
            style: { size, bold: true, color: media.text.color, strokeColor: media.text.stroke, strokeWidth: 0.12 },
            maxWidth: Math.min(0.96, box.hw + 0.06),
            align: media.text.align,
            origin: { sceneIndex: scene.index, shotOrder: shot.order },
          });
          continue;
        }
        const capcutIntro = fresh ? (asset.type === "graphic" ? textIntroRef : revealIntroRef) : null;
        const loop = LOOPING_SPRITE.test(asset.description);
        const layer = i + 1 + (insert ? 1 : 0);
        // Beats of one action share the time after this one comes on, in order.
        const beat = beatOf(asset);
        const beats = beat?.k === 1 ? laterBeats.filter((r) => beatOf(r.asset)!.n === beat.n) : [];
        const start = appearAt(i);
        const beatMs = Math.floor((durationMs - start) / (beats.length + 1));
        pushLayer(
          `s${scene.index}-${shot.order}-c${i + 1}`,
          media,
          layer,
          "cutout",
          "contain",
          bases[i]!,
          start,
          loop,
          intro,
          capcutIntro,
          beats.length > 0 ? start + beatMs : durationMs,
        );
        beats
          .sort((a, b) => beatOf(a.asset)!.k - beatOf(b.asset)!.k)
          .forEach((next, j) => {
            const from = start + beatMs * (j + 1);
            const to = j === beats.length - 1 ? durationMs : from + beatMs;
            const base = fitInside({ ...bases[i]!, scale: (bases[i]!.scale * media.height) / next.media.height }, next.media, canvas);
            pushLayer(
              `s${scene.index}-${shot.order}-c${i + 1}b${j + 2}`,
              next.media,
              layer,
              "cutout",
              "contain",
              grounded[i] ? { ...base, y: bases[i]!.y } : base,
              from,
              LOOPING_SPRITE.test(next.asset.description),
              undefined,
              null,
              to,
            );
          });
        // A sound for what comes on: what it is (a notification → "ting"), else
        // the recipe's reveal sound for elements popping in after the cut. A
        // one-off animation (a phone lighting up) sounds when it lands — its last frame.
        if (recipe.sfx.enabled && !carried && !held[i]) {
          const smart = recipe.sfx.smart ? SMART_SFX.find(([re]) => re.test(asset.description))?.[1] : undefined;
          const category = smart ?? (fresh ? recipe.sfx.reveal : null);
          const landsAt =
            smart && !loop && media.paths.length > 1
              ? (spriteSchedule(media.paths.length, start, durationMs, recipe.sprite.frameMs, false).at(-1)?.from ?? start)
              : start;
          if (category) sfxEvents.push({ atMs: cursor + landsAt, category, priority: smart ? 2 : 0 });
        }
      }
      // ---- stickers & key words (from "enrich shots"): pop in beside the speaker, one after another ----
      const callouts = cutouts.some((c) => c.asset.type === "graphic") ? [] : (shot.callouts ?? []);
      const stickers: { media: Media; label: string; placement?: string }[] = [];
      for (const sticker of shot.stickers ?? []) {
        const cell = await stickerOf(sticker.sheetAssetId, sticker.cell, scene.index);
        if (cell) {
          stickers.push({
            media: { paths: [cell.path], width: cell.width, height: cell.height },
            label: sticker.label,
            placement: sticker.placement,
          });
        }
      }
      // A sticker set beside a line of text ("bên phải dòng “X”") sits right next to
      // it, an icon a bit taller than the line, and comes on with it.
      const besideOf = (placement: string | undefined, m: Media) => {
        const beside = placement ? parsePlacement(placement).beside : undefined;
        const ref = beside ? cutouts.findIndex((c) => wordsOf(c.asset).includes(beside.words.toLowerCase())) : -1;
        if (!beside || ref < 0) return null;
        const refBox = halfExtents(bases[ref]!, cutouts[ref]!.media, canvas);
        const height = Math.min(0.26, Math.max(0.1, refBox.hh * 1.8));
        const scale = placementScale({ x: 0, y: 0, size: height, axis: "height", sized: true, alignLeft: false }, m, canvas);
        const box = halfExtents({ ...IDENTITY_TRANSFORM, scale }, m, canvas);
        const dir = beside.side === "left" ? -1 : 1;
        const base = fitInside(
          { ...IDENTITY_TRANSFORM, scale, x: bases[ref]!.x + dir * (refBox.hw + box.hw + 0.03), y: bases[ref]!.y },
          m,
          canvas,
        );
        return { base, at: appearAt(ref) + 120 };
      };
      if (!carried && (stickers.length > 0 || callouts.length > 0)) {
        // The free side: away from the speaker (the shot's main subject); a centred speaker gets both sides.
        const speakerX = main >= 0 ? bases[main]!.x : 0;
        const side = speakerX > 0.05 ? -1 : speakerX < -0.05 ? 1 : 0;
        const textSide = side === 0 ? -1 : side;
        const W = canvas.width;
        const H = canvas.height;
        // A key word's box, in pixels, for keeping stickers off it.
        const calloutBoxes = callouts.map((text) => {
          const lineW = Array.from(text).length * 0.55 * CALLOUT_STYLE.size * H;
          const lines = Math.max(1, Math.ceil(lineW / (CALLOUT_MAX_WIDTH * W)));
          return { width: Math.min(lineW, CALLOUT_MAX_WIDTH * W), height: lines * 1.3 * CALLOUT_STYLE.size * H };
        });
        const calloutBases = calloutBoxes.map((box, k) => {
          const halfH = box.height / H;
          return { ...IDENTITY_TRANSFORM, x: textSide * 0.5, y: -0.9 + halfH + k * 0.25, scale: 1 / Math.min(W / box.width, H / box.height) };
        });
        const besides = stickers.map(({ media: m, placement }) => besideOf(placement, m));
        const free = stickers.filter((_, k) => !besides[k]);
        const stickerBases = stickers.map(({ media: m }, index) => {
          const beside = besides[index];
          if (beside) return beside.base;
          const k = free.indexOf(stickers[index]!);
          const n = free.length;
          const scale = Math.min(
            placementScale({ x: 0, y: 0, size: STICKER_HEIGHT, axis: "height", sized: true, alignLeft: false }, m, canvas),
            placementScale({ x: 0, y: 0, size: STICKER_WIDTH, axis: "width", sized: true, alignLeft: false }, m, canvas),
          );
          const column = side === 0 ? (k % 2 === 0 ? -1 : 1) : side;
          const row = side === 0 ? Math.floor(k / 2) : k;
          const rows = side === 0 ? Math.ceil(n / 2) : n;
          const y = rows === 1 ? 0.2 : -0.2 + (row * 0.75) / (rows - 1);
          const x = column * 0.6 + (side === 0 ? 0 : (k % 2 === 0 ? -0.08 : 0.08) * column);
          return fitInside({ ...IDENTITY_TRANSFORM, x, y, scale, rotation: STICKER_TILT[k % STICKER_TILT.length]! }, m, canvas);
        });
        const placedAll = avoidOverlap(
          [
            ...cutouts.map(({ media: m }, i) => ({ base: bases[i]!, size: m, pinned: true })),
            ...calloutBoxes.map((box, k) => ({ base: calloutBases[k]!, size: box, pinned: true })),
            ...stickers.map(({ media: m }, k) => ({ base: stickerBases[k]!, size: m, pinned: Boolean(besides[k]) })),
          ],
          canvas,
        ).slice(cutouts.length + calloutBoxes.length);
        // Key words come on early; stickers follow, spread over the shot.
        const textAt = Math.min(300, Math.round(durationMs * 0.1));
        callouts.forEach((text, k) => {
          const from = textAt + k * 400;
          if (from >= durationMs - 300) return;
          texts.push({
            id: `s${scene.index}-${shot.order}-t${k + 1}`,
            startMs: cursor + from,
            durationMs: durationMs - from,
            // Key words read like the video's titles: all caps.
            text: text.toLocaleUpperCase("vi"),
            ...animateLayer(knots, { ...calloutBases[k]!, scale: 1 }, 0, durationMs - from, { kind: "pop", durationMs: 220 }),
            style: CALLOUT_STYLE,
            maxWidth: CALLOUT_MAX_WIDTH,
            origin: { sceneIndex: scene.index, shotOrder: shot.order },
          });
        });
        const first = Math.max(500, Math.round(durationMs * 0.18));
        const last = Math.round(durationMs * 0.8);
        const nextLayer = cutouts.length + 1 + (insert ? 1 : 0);
        stickers.forEach(({ media: m }, k) => {
          const j = free.indexOf(stickers[k]!);
          const at =
            besides[k]?.at ?? (free.length === 1 ? first : first + Math.round(((last - first) * j) / (free.length - 1)));
          if (at >= durationMs - 200) return;
          pushLayer(
            `s${scene.index}-${shot.order}-k${k + 1}`,
            m,
            nextLayer + k,
            "cutout",
            "contain",
            placedAll[k]!,
            at,
            false,
            introOf(recipe.reveal.animation === "none" ? "pop" : recipe.reveal.animation, recipe.reveal.durationMs || 160),
            revealIntroRef,
          );
        });
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

  // ---- sound effects: sparse on purpose — ≥ 1.2 s apart, at most N a minute,
  // the more meaningful sound winning a clash (hit > smart > scene change > reveal).
  const audio: AudioClip[] = [];
  if (recipe.sfx.enabled && sfxEvents.length > 0 && recipe.sfx.maxPerMinute > 0) {
    const byPriority = [...sfxEvents].sort((a, b) => b.priority - a.priority || a.atMs - b.atMs);
    const kept: typeof sfxEvents = [];
    for (const event of byPriority) {
      const tooClose = kept.some((k) => Math.abs(k.atMs - event.atMs) < SFX_MIN_GAP_MS);
      const inMinute = kept.filter((k) => Math.abs(k.atMs - event.atMs) < 30_000).length;
      if (!tooClose && inMinute < recipe.sfx.maxPerMinute) kept.push(event);
    }
    kept.sort((a, b) => a.atMs - b.atMs);
    const library = new Map<string, { path: string; durationMs: number }[]>();
    const turn = new Map<string, number>();
    const volume = Math.round(10 ** (recipe.sfx.volumeDb / 20) * 1000) / 1000;
    for (const [n, event] of kept.entries()) {
      if (!library.has(event.category)) {
        const sounds: { path: string; durationMs: number }[] = [];
        for (const asset of searchLibrary(caller.id, admin, { mediaType: "audio", category: event.category, limit: 40 })) {
          const file = getFileForUser(caller.id, admin, asset.fileId);
          const length = file ? (await probeMedia(file.absolutePath)).durationMs : undefined;
          if (file && length) sounds.push({ path: file.absolutePath, durationMs: length });
        }
        // Clicks too short to hear under a voice go, unless they're all the category has.
        const audible = sounds.filter((sound) => sound.durationMs >= MIN_SFX_MS);
        library.set(event.category, audible.length >= 2 ? audible : sounds);
        if (sounds.length === 0) warnings.push({ code: "sfxMissing", detail: event.category });
      }
      const sounds = library.get(event.category)!;
      if (sounds.length === 0) continue;
      // Take the category's sounds in turn, so repeats are spread out.
      const index = turn.get(event.category) ?? 0;
      turn.set(event.category, index + 1);
      const sound = sounds[index % sounds.length]!;
      let mediaId = media.get(sound.path)?.id;
      if (!mediaId) {
        mediaId = `m${media.size + 1}`;
        media.set(sound.path, { id: mediaId, kind: "audio", path: sound.path, durationMs: sound.durationMs });
      }
      const length = Math.min(sound.durationMs, SFX_MAX_MS, Math.max(1, cursor - event.atMs));
      audio.push({
        id: `sfx-${n + 1}`,
        mediaId,
        role: "sfx",
        startMs: event.atMs,
        durationMs: length,
        sourceStartMs: 0,
        volume,
        fadeOutMs: length < sound.durationMs ? Math.min(300, Math.floor(length / 3)) : undefined,
      });
    }
  }

  const timeline: Timeline = {
    version: TIMELINE_VERSION,
    videoId,
    name: video.name,
    canvas,
    durationMs: cursor,
    media: [...media.values()],
    visual,
    audio,
    subtitles,
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    texts,
    transitions,
    effects,
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
