import { RENDER_DIMENSIONS, RENDER_FPS } from "../../../shared/frame-ratio.js";
import type { RenderManifest, RenderManifestClip, RenderProject, ShotKind } from "../../../shared/types.js";

/** Shots whose whole point is the text — they always carry it, whatever the caption setting. */
const TEXT_SHOTS: ShotKind[] = ["titleCard", "blurSlideTitle", "markerTitle", "textMask"];

/**
 * One clip per scene, back to back — the project's own scenes are the whole
 * timeline. A transition is split across the cut: the outgoing clip plays its
 * half (`transitionOut`), the next clip the other half (`transitionIn`).
 */
export function buildManifest(project: RenderProject): RenderManifest {
  const fps = RENDER_FPS;
  const { width, height } = RENDER_DIMENSIONS[project.frameRatio];
  let cursor = 0;
  const clips = project.scenes.map((scene, sceneIndex): RenderManifestClip => {
    const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));
    const text = scene.text.trim();
    const textShot = TEXT_SHOTS.includes(scene.shotKind);
    const clip: RenderManifestClip = {
      sceneIndex,
      from: cursor,
      durationInFrames,
      shotKind: scene.shotKind,
      imageFileId: scene.imageFileId,
      transitionIn: sceneIndex > 0 ? project.scenes[sceneIndex - 1]!.transitionOut : "cut",
      transitionOut: sceneIndex < project.scenes.length - 1 ? scene.transitionOut : "cut",
      caption:
        text && (textShot || scene.captionStyle !== "none")
          ? {
              text,
              style: textShot || scene.captionStyle === "title" ? "title" : "lowerThird",
              emphasis: scene.emphasis?.trim() || undefined,
            }
          : undefined,
    };
    cursor += durationInFrames;
    return clip;
  });
  return { fps, width, height, totalDurationInFrames: cursor, clips, audio: project.audio };
}
