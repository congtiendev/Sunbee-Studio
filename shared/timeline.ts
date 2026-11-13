import type { FrameRatio } from "./types.js";

/**
 * The edit plan as data: ONE renderer-neutral timeline built from a video's
 * shots, picked images and voice, then turned into a video by a writer — a
 * CapCut draft (`server/services/capcut/`) or an ffmpeg render. Writers only
 * translate; every creative decision (which image, where, how it moves, when
 * a line is on screen) is made here, once, so both outputs look the same.
 *
 * Conventions (writers convert to their own):
 * - Time: integer milliseconds. Clip times are absolute on the timeline;
 *   keyframe times are relative to their clip's start.
 * - Position: canvas-centred and normalised — (0, 0) is the centre, x = ±1 the
 *   left/right edge, y = ±1 the top/bottom edge (y grows DOWN, like screen pixels).
 * - Scale: 1 = the media fitted to the canvas by its clip's `fit`.
 */

export const TIMELINE_VERSION = 1;

export interface TimelineCanvas {
  ratio: FrameRatio;
  width: number;
  height: number;
  fps: number;
}

export type TimelineMediaKind = "image" | "video" | "audio";

/** A source file used by one or more clips. */
export interface TimelineMedia {
  id: string;
  kind: TimelineMediaKind;
  /** Absolute local path — both writers need a real file on disk. */
  path: string;
  /** Pixel size (image/video); writers that need it probe the file when absent. */
  width?: number;
  height?: number;
  /** Audio/video length; required for audio so a clip can't run past its file. */
  durationMs?: number;
  /** Image has transparency (a cutout PNG): composited over what's under it. */
  hasAlpha?: boolean;
}

/** The transform of a visual clip at one moment. Omitted fields keep the clip's base value. */
export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

export type KeyframeEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface TimelineKeyframe extends Partial<ClipTransform> {
  /** Relative to the clip's start; 0..clip.durationMs. */
  atMs: number;
  /** How the value moves from the previous keyframe to this one. */
  easing?: KeyframeEasing;
}

/** Where a clip comes from in the plan, so the UI can link a clip back to its shot. */
export interface ClipOrigin {
  sceneIndex: number;
  /** `SceneShot.order`; absent when the scene wasn't broken into shots. */
  shotOrder?: number;
  /** Index in the scene's `requiredAssets`. */
  assetIndex?: number;
}

export type VisualClipRole = "background" | "cutout";

export interface VisualClip {
  id: string;
  mediaId: string;
  role: VisualClipRole;
  startMs: number;
  durationMs: number;
  /**
   * Stacking order: 0 = bottom (backgrounds), higher draws on top. Clips on
   * the same layer must not overlap in time — writers map each layer to one track.
   */
  layer: number;
  /** How the media is sized at scale 1: cover the canvas (crop), fit inside it, or its own pixel size. */
  fit: "cover" | "contain" | "none";
  transform: ClipTransform;
  /** Motion over the clip (camera movement for backgrounds, animation for cutouts). Sorted by `atMs`. */
  keyframes?: TimelineKeyframe[];
  /** Video media only: where in the source to start. */
  sourceStartMs?: number;
  /** Video media only: its own sound, 1 = original level. Default 0 (b-roll plays muted under the voice). */
  volume?: number;
  origin?: ClipOrigin;
}

export type AudioClipRole = "voice" | "music" | "sfx";

export interface AudioClip {
  id: string;
  mediaId: string;
  role: AudioClipRole;
  startMs: number;
  durationMs: number;
  /** Where in the audio file to start. */
  sourceStartMs: number;
  /** 1 = original level. */
  volume: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  origin?: ClipOrigin;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  durationMs: number;
  text: string;
  origin?: ClipOrigin;
}

export interface SubtitleStyle {
  /** Text height as a fraction of the canvas height (0.05 ≈ 54px on 1080p). */
  size: number;
  bold: boolean;
  /** "#rrggbb" */
  color: string;
  /** "#rrggbb"; no outline when absent. */
  strokeColor?: string;
  /** Outline thickness as a fraction of the text size. */
  strokeWidth?: number;
  /** Vertical position of the text's centre, same units as `ClipTransform.y` (0.82 = low in the frame). */
  y: number;
}

/** White bold text with a black outline, low in the frame — readable over any image. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 0.05,
  bold: true,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 0.08,
  y: 0.82,
};

export interface Timeline {
  version: typeof TIMELINE_VERSION;
  videoId: string;
  /** Display name for the output (CapCut project name, file name). */
  name: string;
  canvas: TimelineCanvas;
  /** End of the last clip. */
  durationMs: number;
  media: TimelineMedia[];
  visual: VisualClip[];
  audio: AudioClip[];
  subtitles: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
}

export const IDENTITY_TRANSFORM: ClipTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

/** Pixel canvas for a frame ratio (1080p on the short side). */
export const TIMELINE_CANVAS: Record<FrameRatio, Omit<TimelineCanvas, "fps" | "ratio">> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
};

/** The transform of a clip at `atMs` (relative to its start), interpolating its keyframes. */
export function transformAt(clip: VisualClip, atMs: number): ClipTransform {
  const frames = clip.keyframes ?? [];
  const result = { ...clip.transform };
  for (const key of ["x", "y", "scale", "rotation", "opacity"] as const) {
    const points = frames.filter((frame) => frame[key] !== undefined);
    if (points.length === 0) continue;
    const next = points.findIndex((frame) => frame.atMs >= atMs);
    if (next === -1) result[key] = points[points.length - 1][key]!;
    else if (next === 0) result[key] = points[0][key]!;
    else {
      const a = points[next - 1];
      const b = points[next];
      const t = ease(b.easing ?? "linear", (atMs - a.atMs) / Math.max(1, b.atMs - a.atMs));
      result[key] = a[key]! + (b[key]! - a[key]!) * t;
    }
  }
  return result;
}

export function ease(easing: KeyframeEasing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
    default:
      return x;
  }
}

/**
 * Problems that would make a writer produce a broken output, as readable
 * messages (empty = valid). Writers call this first and refuse on any.
 */
export function validateTimeline(timeline: Timeline): string[] {
  const errors: string[] = [];
  if (timeline.version !== TIMELINE_VERSION) errors.push(`version ${String(timeline.version)} ≠ ${String(TIMELINE_VERSION)}`);
  const { width, height, fps } = timeline.canvas;
  if (!(width > 0 && height > 0 && fps > 0)) errors.push("canvas needs positive width, height and fps");

  const media = new Map(timeline.media.map((item) => [item.id, item]));
  if (media.size !== timeline.media.length) errors.push("duplicate media ids");
  for (const item of timeline.media) {
    if (!item.path) errors.push(`media ${item.id}: no path`);
    if (item.kind === "audio" && !(item.durationMs && item.durationMs > 0)) {
      errors.push(`media ${item.id}: audio needs durationMs`);
    }
  }

  const timing = (label: string, clip: { startMs: number; durationMs: number }) => {
    if (!Number.isInteger(clip.startMs) || clip.startMs < 0) errors.push(`${label}: startMs must be a non-negative integer`);
    if (!Number.isInteger(clip.durationMs) || clip.durationMs <= 0) errors.push(`${label}: durationMs must be a positive integer`);
  };

  const byLayer = new Map<number, VisualClip[]>();
  for (const clip of timeline.visual) {
    const label = `visual ${clip.id}`;
    timing(label, clip);
    const source = media.get(clip.mediaId);
    if (!source) errors.push(`${label}: unknown media ${clip.mediaId}`);
    else if (source.kind === "audio") errors.push(`${label}: media ${clip.mediaId} is audio`);
    for (const frame of clip.keyframes ?? []) {
      if (frame.atMs < 0 || frame.atMs > clip.durationMs) errors.push(`${label}: keyframe at ${frame.atMs}ms is outside the clip`);
    }
    byLayer.set(clip.layer, [...(byLayer.get(clip.layer) ?? []), clip]);
  }
  for (const [layer, clips] of byLayer) {
    const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (sorted[i].startMs < prev.startMs + prev.durationMs) {
        errors.push(`layer ${layer}: ${prev.id} overlaps ${sorted[i].id}`);
      }
    }
  }

  for (const clip of timeline.audio) {
    const label = `audio ${clip.id}`;
    timing(label, clip);
    const source = media.get(clip.mediaId);
    if (!source) errors.push(`${label}: unknown media ${clip.mediaId}`);
    else if (source.kind !== "audio") errors.push(`${label}: media ${clip.mediaId} is not audio`);
    else if (source.durationMs && clip.sourceStartMs + clip.durationMs > source.durationMs) {
      errors.push(`${label}: runs past the end of its file`);
    }
  }

  for (const cue of timeline.subtitles) {
    timing(`subtitle ${cue.id}`, cue);
    if (!cue.text.trim()) errors.push(`subtitle ${cue.id}: empty text`);
  }
  return errors;
}
