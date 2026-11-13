import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BlurSlideWords } from "../caption";
import { EASE, SANS, ramp } from "../motion";
import { Backdrop, Picture, Still, type ShotProps } from "./common";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function StaticHold({ src }: ShotProps) {
  return <Picture src={src} />;
}

/** Slow push-in with a sideways drift; the drift alternates clip to clip so cuts don't all slide the same way. */
export function KenBurns({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  if (!src) return <Backdrop />;
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

/** The picture with a dark foot for the rising caption (the caption itself is layered on by the clip). */
export function LowerThirdCaption({ src }: ShotProps) {
  return (
    <AbsoluteFill>
      <Picture src={src} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 45%)" }} />
    </AbsoluteFill>
  );
}

/** Full-frame text card — over the picture (blurred, darkened) when there is one. */
export function TitleCard({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const text = clip.caption?.text ?? "";
  const scale = ramp(frame, 0, 14, EASE.snappy) * 0.06 + 0.94;
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
        <div style={{ transform: `scale(${scale})` }}>
          <BlurSlideWords
            text={text}
            emphasis={clip.caption?.emphasis}
            revealFrames={Math.max(12, Math.min(30, clip.durationInFrames * 0.4))}
            lift={base * 0.05}
            blur={16}
            style={{
              justifyContent: "center",
              textAlign: "center",
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: base * (text.length > 80 ? 0.06 : 0.085),
              lineHeight: 1.2,
              color: "#fff",
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
