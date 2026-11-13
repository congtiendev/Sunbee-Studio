import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderManifestClip } from "../../shared/types";
import { FONT_FAMILY } from "./caption";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Stand-in behind the caption when a clip has no picked image. */
function Backdrop() {
  return <AbsoluteFill style={{ background: "linear-gradient(135deg, #111827 0%, #1e293b 55%, #0f172a 100%)" }} />;
}

function Still({ src }: { src: string }) {
  return <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}

/** Slow push-in with a sideways drift; the drift direction alternates clip to clip so cuts don't all slide the same way. */
function KenBurns({ clip, src }: { clip: RenderManifestClip; src: string }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, clip.durationInFrames], [1.04, 1.16], CLAMP);
  const direction = clip.sceneIndex % 2 === 0 ? 1 : -1;
  const drift = interpolate(frame, [0, clip.durationInFrames], [-2, 2], CLAMP) * direction;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${drift}%)` }}>
        <Still src={src} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Full-frame text card — over the picked image (blurred, darkened) when there is one. */
function TitleCard({ clip, src }: { clip: RenderManifestClip; src?: string }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const text = clip.caption?.text ?? "";
  const opacity = interpolate(frame, [0, 10], [0, 1], CLAMP);
  const scale = interpolate(frame, [0, 14], [0.94, 1], CLAMP);
  return (
    <AbsoluteFill>
      {src ? (
        <AbsoluteFill style={{ filter: "blur(18px) brightness(0.45)", transform: "scale(1.1)" }}>
          <Still src={src} />
        </AbsoluteFill>
      ) : (
        <Backdrop />
      )}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: base * 0.08 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: base * (text.length > 80 ? 0.06 : 0.085),
            fontWeight: 800,
            lineHeight: 1.2,
            color: "#fff",
            textAlign: "center",
            whiteSpace: "pre-wrap",
            opacity,
            transform: `scale(${scale})`,
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** The picture of one clip, by its `shotKind` (captions are layered on top separately, except for title cards). */
export function ClipVisual({ clip, src }: { clip: RenderManifestClip; src?: string }) {
  if (clip.shotKind === "titleCard") return <TitleCard clip={clip} src={src} />;
  if (!src) return <Backdrop />;
  if (clip.shotKind === "kenBurns") return <KenBurns clip={clip} src={src} />;
  if (clip.shotKind === "lowerThirdCaption") {
    return (
      <AbsoluteFill>
        <Still src={src} />
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 45%)" }} />
      </AbsoluteFill>
    );
  }
  return <Still src={src} />;
}
