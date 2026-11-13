import { RENDER_DIMENSIONS, RENDER_FPS } from "../../../shared/frame-ratio.js";
import type { RenderManifest, RenderManifestClip, RenderProject } from "../../../shared/types.js";

/** One clip per scene, back to back — the project's own scenes are the whole timeline. */
export function buildManifest(project: RenderProject): RenderManifest {
  const fps = RENDER_FPS;
  const { width, height } = RENDER_DIMENSIONS[project.frameRatio];
  let cursor = 0;
  const clips = project.scenes.map((scene, sceneIndex): RenderManifestClip => {
    const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));
    const text = scene.text.trim();
    const clip: RenderManifestClip = {
      sceneIndex,
      from: cursor,
      durationInFrames,
      shotKind: scene.shotKind,
      imageFileId: scene.imageFileId,
      transitionIn: sceneIndex > 0 && project.scenes[sceneIndex - 1]!.transitionOut === "fade" ? "fade" : "cut",
      transitionOut: scene.transitionOut,
      caption:
        text && (scene.captionStyle !== "none" || scene.shotKind === "titleCard")
          ? { text, style: scene.captionStyle === "title" ? "title" : "lowerThird" }
          : undefined,
    };
    cursor += durationInFrames;
    return clip;
  });
  return { fps, width, height, totalDurationInFrames: cursor, clips, audio: project.audio };
}
