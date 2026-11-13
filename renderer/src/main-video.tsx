import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { RenderInputProps } from "../../shared/render";
import type { RenderManifestClip } from "../../shared/types";
import { Caption } from "./caption";
import { ClipVisual } from "./shots";

const FADE_FRAMES = 12;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function dbToGain(db: number | undefined): number {
  return db === undefined ? 1 : Math.pow(10, db / 20);
}

/** One clip, with its fade in/out applied at its own edges (v1: no cross-dissolve between clips). */
function ClipLayer({ clip, src }: { clip: RenderManifestClip; src?: string }) {
  const frame = useCurrentFrame();
  const fade = Math.min(FADE_FRAMES, Math.floor(clip.durationInFrames / 3));
  const fadeIn =
    clip.transitionIn === "fade" && fade > 0 ? interpolate(frame, [0, fade], [0, 1], CLAMP) : 1;
  const fadeOut =
    clip.transitionOut === "fade" && fade > 0
      ? interpolate(frame, [clip.durationInFrames - fade, clip.durationInFrames], [1, 0], CLAMP)
      : 1;

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <ClipVisual clip={clip} src={src} />
      {clip.caption && clip.caption.text.trim() && clip.shotKind !== "titleCard" && (
        <Caption
          text={clip.caption.text}
          style={clip.caption.style}
          reveal={clip.shotKind === "lowerThirdCaption"}
        />
      )}
    </AbsoluteFill>
  );
}

export function MainVideo({ manifest, sources }: RenderInputProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {manifest.clips.map((clip, index) => (
        <Sequence key={`clip-${index}`} from={clip.from} durationInFrames={clip.durationInFrames}>
          <ClipLayer clip={clip} src={clip.imageFileId ? sources[clip.imageFileId] : undefined} />
        </Sequence>
      ))}
      {manifest.audio.map((cue, index) => {
        const src = sources[cue.fileId];
        if (!src) return null;
        return (
          <Sequence
            key={`audio-${index}`}
            from={cue.from}
            durationInFrames={cue.durationInFrames}
            layout="none"
          >
            <Audio src={src} volume={dbToGain(cue.gainDb)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
