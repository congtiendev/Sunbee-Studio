import { randomUUID } from "node:crypto";
import {
  ease,
  transformAt,
  type AudioClip,
  type ClipTransform,
  type SubtitleCue,
  type SubtitleStyle,
  type TextClip,
  type Timeline,
  type VisualClip,
} from "../../../shared/timeline.js";
import { emptyDraftInfo, emptyMaterials, type DraftMaterials } from "./template.js";

/**
 * Timeline → CapCut `draft_info.json` (pure: no files touched).
 *
 * Every object below has exactly the fields pyJianYingDraft / VectCutAPI
 * write — the drafts the Người Que pipeline opens in CapCut 9.3/9.5 — and
 * only the timeline's values are ours. CapCut units: microseconds; position
 * 1 = half the canvas, y UP; scale 1 = the media filling the canvas (media is
 * prepared to the canvas ratio first, see media.ts); rotation in degrees,
 * clockwise. Keyframes are "Line" only (the one curve type known to work):
 * eased moves are sampled into several linear steps.
 */

/** An image as it goes into the draft: already at the canvas ratio, inside the draft's assets folder. */
export interface DraftImage {
  /** Final absolute path (inside the draft folder). */
  path: string;
  /** Original file, kept as the material's `remote_url` like VectCutAPI does. */
  sourcePath: string;
  width: number;
  height: number;
}

export interface DraftAudio {
  path: string;
  sourcePath: string;
  durationMs: number;
}

export interface DraftContentInput {
  timeline: Timeline;
  draftId: string;
  /** Keyed by `imageKey(clip)`. */
  images: Map<string, DraftImage>;
  /** Keyed by media id. */
  audios: Map<string, DraftAudio>;
  /** Subtitle font: a CapCut library font (downloaded by CapCut on open), or CapCut's default. */
  subtitleFont: "nunito" | "default";
}

/** One prepared image per media + fit (the same file can be used both as cover and contain). */
export function imageKey(clip: Pick<VisualClip, "mediaId" | "fit">): string {
  return `${clip.mediaId}:${clip.fit}`;
}

const us = (ms: number) => Math.round(ms * 1000);
const hexId = () => randomUUID().replace(/-/g, "");

/** Track z-order: video tracks by layer, audio at 0, text above everything (VectCutAPI imports subtitles at 15000 + 999). */
const TEXT_RENDER_INDEX = 15999;
/** Effect tracks sit above the picture, below text (pyJianYingDraft's effect track base). */
const EFFECT_RENDER_INDEX = 10000;
/** Photos get a 3-hour material duration, as CapCut gives a still image. */
const PHOTO_DURATION_US = 10_800_000_000;
/** CapCut's library font the Người Que channel uses for subtitles. */
const NUNITO = { resourceId: "6807743644842332685", name: "Nunito" };
/**
 * Our subtitle style → CapCut text units, calibrated on the Người Que channel
 * standard: CapCut size 6 ≈ 0.05 of the height; outline 30/100 in CapCut's
 * panel (stored as 30/100 × 0.2 = 0.06) ≈ 0.08 of the text size.
 * Re-check against the ffmpeg renderer.
 */
const CAPCUT_TEXT_SIZE_PER_HEIGHT = 120;
const CAPCUT_STROKE_PER_SIZE = 0.75;
/** Eased keyframe moves become this many linear steps. */
const EASE_STEPS = 6;
/** Subtitles may not overlap in CapCut: a line ends this long before the next starts. */
const SUBTITLE_GAP_MS = 10;

export function buildDraftContent(input: DraftContentInput): Record<string, unknown> {
  const { timeline } = input;
  const materials = emptyMaterials();
  const tracks: Record<string, unknown>[] = [];

  // ---- images: one video track per layer, bottom first ----
  const photoMaterialIds = new Map<string, string>();
  const segmentOfClip = new Map<string, { extra_material_refs: string[] }>();
  const layers = [...new Set(timeline.visual.map((clip) => clip.layer))].sort((a, b) => a - b);
  for (const [rank, layer] of layers.entries()) {
    const clips = timeline.visual.filter((clip) => clip.layer === layer).sort((a, b) => a.startMs - b.startMs);
    const segments = clips.map((clip) => {
      const key = imageKey(clip);
      const image = input.images.get(key);
      if (!image) throw new Error(`No prepared image for clip ${clip.id} (${key})`);
      let materialId = photoMaterialIds.get(key);
      if (!materialId) {
        materialId = hexId();
        photoMaterialIds.set(key, materialId);
        materials.videos.push(photoMaterial(materialId, image));
      }
      const segment = visualSegment(clip, materialId, materials);
      segmentOfClip.set(clip.id, segment);
      return segment;
    });
    tracks.push(track("video", rank === 0 ? "sunbee_background" : `sunbee_layer_${rank}`, segments, rank));
  }

  // ---- CapCut transitions: on the clip before the change ----
  for (const { afterClipId, ref } of timeline.transitions ?? []) {
    const segment = segmentOfClip.get(afterClipId);
    if (!segment) continue;
    const id = hexId();
    materials.transitions.push({
      category_id: "",
      category_name: "",
      duration: us(ref.durationMs),
      effect_id: ref.effectId,
      id,
      is_overlap: Boolean(ref.overlap),
      name: ref.name,
      platform: "all",
      resource_id: ref.resourceId,
      type: "transition",
    });
    segment.extra_material_refs.push(id);
  }

  // ---- CapCut video effects: their own track, over the whole picture ----
  const effects = timeline.effects ?? [];
  if (effects.length) {
    const segments = [...effects]
      .sort((a, b) => a.startMs - b.startMs)
      .map((effect) => {
        const id = hexId();
        materials.video_effects.push({
          adjust_params: (effect.ref.params ?? []).map((param, index) => ({
            default_value: param.default,
            max_value: param.max,
            min_value: param.min,
            name: param.name,
            parameterIndex: index,
            portIndex: 0,
            value: param.default,
          })),
          apply_target_type: 2,
          apply_time_range: null,
          category_id: "",
          category_name: "",
          common_keyframes: [],
          disable_effect_faces: [],
          effect_id: effect.ref.effectId,
          formula_id: "",
          id,
          name: effect.ref.name,
          platform: "all",
          render_index: 11000,
          resource_id: effect.ref.resourceId,
          source_platform: 0,
          time_range: null,
          track_render_index: 0,
          type: "video_effect",
          value: 1.0,
          version: "",
        });
        return baseSegment(id, effect.startMs, effect.durationMs);
      });
    tracks.push(track("effect", "effects", segments, EFFECT_RENDER_INDEX));
  }

  // ---- audio: one track per role, more when clips of a role overlap ----
  const audioMaterialIds = new Map<string, string>();
  for (const role of ["voice", "music", "sfx"] as const) {
    const clips = timeline.audio.filter((clip) => clip.role === role).sort((a, b) => a.startMs - b.startMs);
    const lanes: AudioClip[][] = [];
    for (const clip of clips) {
      const lane = lanes.find((list) => {
        const last = list[list.length - 1];
        return last.startMs + last.durationMs <= clip.startMs;
      });
      if (lane) lane.push(clip);
      else lanes.push([clip]);
    }
    for (const [i, lane] of lanes.entries()) {
      const segments = lane.map((clip) => {
        const audio = input.audios.get(clip.mediaId);
        if (!audio) throw new Error(`No audio file for clip ${clip.id} (${clip.mediaId})`);
        let materialId = audioMaterialIds.get(clip.mediaId);
        if (!materialId) {
          materialId = hexId();
          audioMaterialIds.set(clip.mediaId, materialId);
          materials.audios.push(audioMaterial(materialId, audio));
        }
        return audioSegment(clip, materialId, materials);
      });
      tracks.push(track("audio", i === 0 ? role : `${role}_${i + 1}`, segments));
    }
  }

  // ---- subtitles ----
  const cues = nonOverlapping(timeline.subtitles);
  if (cues.length) {
    const segments = cues.map((cue) => textSegment(cue, timeline.subtitleStyle, input.subtitleFont, materials));
    tracks.push(track("text", "subtitles", segments, TEXT_RENDER_INDEX));
  }

  // ---- pop-up text (key words): one track, below the subtitles ----
  const texts = [...(timeline.texts ?? [])].sort((a, b) => a.startMs - b.startMs);
  if (texts.length) {
    // Overlapping texts can't share a track: each goes on the first track free at its start.
    const lanes: TextClip[][] = [];
    for (const clip of texts) {
      const lane = lanes.find((l) => l.at(-1)!.startMs + l.at(-1)!.durationMs <= clip.startMs);
      if (lane) lane.push(clip);
      else lanes.push([clip]);
    }
    lanes.forEach((lane, i) => {
      const segments = lane.map((clip) => popupTextSegment(clip, input.subtitleFont, materials));
      tracks.push(track("text", i === 0 ? "callouts" : `callouts_${i + 1}`, segments, TEXT_RENDER_INDEX - 100 + i));
    });
  }

  const durationUs = Math.max(
    0,
    ...[...timeline.visual, ...timeline.audio, ...cues, ...texts].map((clip) => us(clip.startMs + clip.durationMs)),
  );
  return {
    ...emptyDraftInfo(),
    id: input.draftId,
    fps: timeline.canvas.fps,
    duration: durationUs,
    canvas_config: {
      background: null,
      height: timeline.canvas.height,
      ratio: timeline.canvas.ratio,
      width: timeline.canvas.width,
    },
    materials,
    tracks,
  };
}

// ---------- tracks & segments ----------

/** A track; its render index (z-order) is stamped on each of its segments, as pyJianYingDraft does. */
function track(type: "video" | "audio" | "text" | "effect", name: string, segments: Record<string, unknown>[], index = 0) {
  return {
    attribute: 0,
    flag: 0,
    id: hexId(),
    is_default_name: false,
    name,
    segments: segments.map((segment) => ({ ...segment, render_index: index })),
    type,
  };
}

function timerange(startMs: number, durationMs: number) {
  return { start: us(startMs), duration: us(durationMs) };
}

/** Fields every segment has (pyJianYingDraft `Base_segment`). */
function baseSegment(materialId: string, startMs: number, durationMs: number, keyframes: unknown[] = []) {
  return {
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    last_nonzero_volume: 1.0,
    reverse: false,
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    id: hexId(),
    material_id: materialId,
    target_timerange: timerange(startMs, durationMs),
    common_keyframes: keyframes,
    keyframe_refs: [],
  };
}

/** Each media/text segment carries its own speed material (always 1×), referenced first in `extra_material_refs`. */
function speedMaterial(materials: DraftMaterials): string {
  const id = hexId();
  materials.speeds.push({ curve_speed: null, id, mode: 0, speed: 1.0, type: "speed" });
  return id;
}

function clipJson(transform: ClipTransform) {
  return {
    alpha: transform.opacity,
    flip: { horizontal: false, vertical: false },
    rotation: transform.rotation,
    scale: { x: transform.scale, y: transform.scale },
    // Timeline y grows down; CapCut's grows up.
    transform: { x: transform.x, y: -transform.y },
  };
}

function visualSegment(clip: VisualClip, materialId: string, materials: DraftMaterials) {
  const refs = [speedMaterial(materials)];
  // A CapCut intro animation: an animation material the segment points at.
  if (clip.capcutIntro) {
    const id = hexId();
    materials.material_animations.push({
      id,
      type: "sticker_animation",
      multi_language_current: "none",
      animations: [
        {
          anim_adjust_params: null,
          platform: "all",
          panel: "video",
          material_type: "video",
          name: clip.capcutIntro.name,
          id: clip.capcutIntro.effectId,
          type: "in",
          resource_id: clip.capcutIntro.resourceId,
          start: 0,
          duration: us(Math.min(clip.capcutIntro.durationMs, clip.durationMs)),
        },
      ],
    });
    refs.push(id);
  }
  return {
    ...baseSegment(materialId, clip.startMs, clip.durationMs, visualKeyframes(clip)),
    source_timerange: timerange(0, clip.durationMs),
    speed: 1.0,
    volume: 1.0,
    extra_material_refs: refs,
    clip: clipJson(transformAt(clip, 0)),
    uniform_scale: { on: true, value: 1.0 },
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
  };
}

function audioSegment(clip: AudioClip, materialId: string, materials: DraftMaterials) {
  const refs = [speedMaterial(materials)];
  if (clip.fadeInMs || clip.fadeOutMs) {
    const id = hexId();
    materials.audio_fades.push({
      id,
      fade_in_duration: us(clip.fadeInMs ?? 0),
      fade_out_duration: us(clip.fadeOutMs ?? 0),
      fade_type: 0,
      type: "audio_fade",
    });
    refs.push(id);
  }
  return {
    ...baseSegment(materialId, clip.startMs, clip.durationMs),
    source_timerange: timerange(clip.sourceStartMs, clip.durationMs),
    speed: 1.0,
    volume: clip.volume,
    extra_material_refs: refs,
    clip: null,
    hdr_settings: null,
  };
}

function textSegment(cue: SubtitleCue, style: SubtitleStyle, font: DraftContentInput["subtitleFont"], materials: DraftMaterials) {
  const materialId = hexId();
  materials.texts.push(textMaterial(materialId, cue.text, style, font));
  return {
    ...baseSegment(materialId, cue.startMs, cue.durationMs),
    source_timerange: null,
    speed: 1.0,
    volume: 1.0,
    extra_material_refs: [speedMaterial(materials)],
    clip: clipJson({ x: 0, y: style.y, scale: 1, rotation: 0, opacity: 1 }),
    uniform_scale: { on: true, value: 1.0 },
  };
}

/** A pop-up text: positioned and keyframed like a picture, styled by its own style. */
function popupTextSegment(clip: TextClip, font: DraftContentInput["subtitleFont"], materials: DraftMaterials) {
  const materialId = hexId();
  materials.texts.push(textMaterial(materialId, clip.text, { ...clip.style, y: 0 }, font, clip.maxWidth));
  const motion = { ...clip, keyframes: clip.keyframes ?? [] } as unknown as VisualClip;
  return {
    ...baseSegment(materialId, clip.startMs, clip.durationMs, visualKeyframes(motion)),
    source_timerange: null,
    speed: 1.0,
    volume: 1.0,
    extra_material_refs: [speedMaterial(materials)],
    clip: clipJson(transformAt(motion, 0)),
    uniform_scale: { on: true, value: 1.0 },
  };
}

/** CapCut rejects overlapping subtitles: each line ends just before the next begins (as Người Que's clean_srt). */
export function nonOverlapping(cues: SubtitleCue[]): SubtitleCue[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs).map((cue) => ({ ...cue }));
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = Math.min(sorted[i].startMs + sorted[i].durationMs, sorted[i + 1].startMs - SUBTITLE_GAP_MS);
    sorted[i].durationMs = end - sorted[i].startMs;
  }
  return sorted.filter((cue) => cue.durationMs > 0);
}

// ---------- keyframes ----------

const KEYFRAME_PROPERTIES = [
  // Uniform scale is written as ScaleX with `uniform_scale.on` (pyJianYingDraft's UNIFORM_SCALE).
  { key: "scale", type: "KFTypeScaleX", toCapcut: (v: number) => v },
  { key: "x", type: "KFTypePositionX", toCapcut: (v: number) => v },
  { key: "y", type: "KFTypePositionY", toCapcut: (v: number) => -v },
  { key: "rotation", type: "KFTypeRotation", toCapcut: (v: number) => v },
  { key: "opacity", type: "KFTypeAlpha", toCapcut: (v: number) => v },
] as const;

/** The clip's keyframes as CapCut `common_keyframes`: one list per animated property, linear steps only. */
export function visualKeyframes(clip: VisualClip): unknown[] {
  const frames = [...(clip.keyframes ?? [])].sort((a, b) => a.atMs - b.atMs);
  if (frames.length === 0) return [];
  const lists: unknown[] = [];
  for (const property of KEYFRAME_PROPERTIES) {
    const points = frames.filter((frame) => frame[property.key] !== undefined);
    if (points.length === 0) continue;
    // Sample eased moves into linear steps; times stay inside the clip.
    const samples: { atMs: number; value: number }[] = [];
    for (const [i, point] of points.entries()) {
      const value = point[property.key]!;
      const prev = points[i - 1];
      const easing = point.easing ?? "linear";
      if (prev && easing !== "linear") {
        const from = prev[property.key]!;
        for (let step = 1; step < EASE_STEPS; step++) {
          const t = step / EASE_STEPS;
          samples.push({
            atMs: prev.atMs + (point.atMs - prev.atMs) * t,
            value: from + (value - from) * ease(easing, t),
          });
        }
      }
      samples.push({ atMs: point.atMs, value });
    }
    lists.push({
      id: hexId(),
      keyframe_list: samples.map((sample) => ({
        curveType: "Line",
        graphID: "",
        left_control: { x: 0.0, y: 0.0 },
        right_control: { x: 0.0, y: 0.0 },
        id: hexId(),
        time_offset: us(sample.atMs),
        values: [round(property.toCapcut(sample.value))],
      })),
      material_id: "",
      property_type: property.type,
    });
  }
  return lists;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

// ---------- materials ----------

function photoMaterial(id: string, image: DraftImage) {
  return {
    audio_fade: null,
    category_id: "",
    category_name: "local",
    check_flag: 63487,
    crop: {
      upper_left_x: 0.0,
      upper_left_y: 0.0,
      upper_right_x: 1.0,
      upper_right_y: 0.0,
      lower_left_x: 0.0,
      lower_left_y: 1.0,
      lower_right_x: 1.0,
      lower_right_y: 1.0,
    },
    crop_ratio: "free",
    crop_scale: 1.0,
    duration: PHOTO_DURATION_US,
    height: image.height,
    id,
    local_material_id: "",
    material_id: id,
    material_name: fileName(image.path),
    media_path: "",
    path: image.path,
    remote_url: image.sourcePath,
    type: "photo",
    width: image.width,
  };
}

function audioMaterial(id: string, audio: DraftAudio) {
  return {
    app_id: 0,
    category_id: "",
    category_name: "local",
    check_flag: 1,
    copyright_limit_type: "none",
    duration: us(audio.durationMs),
    effect_id: "",
    formula_id: "",
    id,
    intensifies_path: "",
    is_ai_clone_tone: false,
    is_text_edit_overdub: false,
    is_ugc: false,
    local_material_id: id,
    music_id: id,
    name: fileName(audio.path),
    path: audio.path,
    remote_url: audio.sourcePath,
    query: "",
    request_id: "",
    resource_id: "",
    search_id: "",
    source_from: "",
    source_platform: 0,
    team_id: "",
    text_id: "",
    tone_category_id: "",
    tone_category_name: "",
    tone_effect_id: "",
    tone_effect_name: "",
    tone_platform: "",
    tone_second_category_id: "",
    tone_second_category_name: "",
    tone_speaker: "",
    tone_type: "",
    type: "extract_music",
    video_id: "",
    wave_points: [],
  };
}

function textMaterial(
  id: string,
  text: string,
  style: SubtitleStyle,
  font: DraftContentInput["subtitleFont"],
  maxWidth = 0.82,
) {
  const stroke = style.strokeColor && style.strokeWidth
    ? [{ content: { solid: { alpha: 1.0, color: rgb(style.strokeColor) } }, width: round(style.strokeWidth * CAPCUT_STROKE_PER_SIZE) }]
    : [];
  const styleItem: Record<string, unknown> = {
    fill: { alpha: 1.0, content: { render_type: "solid", solid: { alpha: 1.0, color: rgb(style.color) } } },
    // Ranges count code points (CapCut is fed by Python, whose len() does).
    range: [0, Array.from(text).length],
    size: round(style.size * CAPCUT_TEXT_SIZE_PER_HEIGHT),
    bold: style.bold,
    italic: false,
    underline: false,
    strokes: stroke,
  };
  if (font === "nunito") styleItem.font = { id: NUNITO.resourceId, path: `C:/${NUNITO.name}.ttf` };
  return {
    id,
    content: JSON.stringify({ styles: [styleItem], text }),
    typesetting: 0,
    alignment: 1,
    letter_spacing: 0,
    line_spacing: 0.02,
    line_feed: 1,
    line_max_width: maxWidth,
    force_apply_line_max_width: false,
    check_flag: stroke.length ? 7 | 8 : 7,
    type: "text",
    fixed_width: -1,
    fixed_height: -1,
    font_category_id: "",
    font_category_name: "",
    font_id: "",
    font_name: "",
    font_path: "",
    font_resource_id: "",
    font_size: 15.0,
    font_source_platform: 0,
    font_team_id: "",
    font_title: "none",
    font_url: "",
    fonts: [],
  };
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => round(parseInt(value.slice(i, i + 2), 16) / 255)) as [number, number, number];
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
