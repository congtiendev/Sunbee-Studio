import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { RenderInputProps } from "../../shared/render";
import type { RenderManifestClip } from "../../shared/types";
import { Caption } from "./caption";
import { ClipVisual, TEXT_SHOTS } from "./shots";
import { TransitionEdges } from "./transitions";

function dbToGain(db: number | undefined): number {
  return db === undefined ? 1 : Math.pow(10, db / 20);
}

/** One clip: its shot, the caption on top (unless the shot typesets the text itself), its transitions at the edges. */
function ClipLayer({ clip, src }: { clip: RenderManifestClip; src?: string }) {
  return (
    <TransitionEdges clip={clip}>
      <ClipVisual clip={clip} src={src} />
      {clip.caption && clip.caption.text.trim() && !TEXT_SHOTS.includes(clip.shotKind) && (
        <Caption
          text={clip.caption.text}
          style={clip.caption.style}
          emphasis={clip.caption.emphasis}
          durationInFrames={clip.durationInFrames}
          reveal={clip.shotKind === "lowerThirdCaption"}
        />
      )}
    </TransitionEdges>
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
