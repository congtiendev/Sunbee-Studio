import type { ClipTransition, RenderManifest, ShotKind } from "./types.js";

/** The one Remotion composition in `renderer/src` — what the server selects and renders. */
export const RENDER_COMPOSITION_ID = "MainVideo";

/**
 * What the server hands Remotion as `inputProps`: the manifest (file ids
 * only, as stored) plus a URL for each file id it references, reachable from
 * the headless browser doing the render.
 */
export type RenderInputProps = {
  manifest: RenderManifest;
  sources: Record<string, string>;
};

export const SHOT_KINDS: ShotKind[] = [
  "kenBurns",
  "staticHold",
  "lowerThirdCaption",
  "titleCard",
  "blurSlideTitle",
  "markerTitle",
  "textMask",
  "crashZoom",
  "jumpCut",
  "pullBack",
];

export const CLIP_TRANSITIONS: ClipTransition[] = ["cut", "fade", "whipPan", "lightLeak"];

/**
 * The video-shotcraft shot card (vendor/video-shotcraft/references/shots/)
 * each renderer shot/transition adapts — how the AI director, reading the
 * skill, maps the card it picks onto what Sunbee can actually render.
 * Sunbee's own base shots have no card.
 */
export const SHOT_KIND_CARDS: Partial<Record<ShotKind | ClipTransition, string>> = {
  blurSlideTitle: "typography/blur-slide",
  markerTitle: "typography/marker-underline-title",
  textMask: "opening/text-as-mask",
  crashZoom: "camera/crash-zoom-punch",
  jumpCut: "rhythm/rhythm-interrupt-moves (jump-cut-punch-in)",
  pullBack: "camera/tension-camera-moves (pull-back-isolation)",
  whipPan: "transition/shot-transitions (whip-pan)",
  lightLeak: "transition/transition-hidden-cut (light-leak-burn)",
};

/** Shots that show the picture full-frame and need an image (the rest are text-led and work without one). */
export const IMAGE_SHOT_KINDS: ShotKind[] = [
  "kenBurns",
  "staticHold",
  "lowerThirdCaption",
  "textMask",
  "crashZoom",
  "jumpCut",
  "pullBack",
];
