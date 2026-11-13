// Shots adapted from video-shotcraft demos (Apache License 2.0 — see
// renderer/NOTICE). Changed: each demo's timing/motion technique is kept,
// but rebuilt as a parameterised shot over the clip's own picture and text
// (any frame ratio, any clip length) instead of the demo's fixed branded
// layout, fixtures and textures.
import { useId } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BlurSlideWords, lengthScale } from "../caption";
import { ACCENT, EASE, SANS, SERIF, clamp01, emphasisIndexes, mix, ramp } from "../motion";
import { Backdrop, Camera, Picture, Still, Vignette, type ShotProps } from "./common";

/** The clip's length as a 0–1 position, for timings that scale with short/long clips. */
function at(duration: number, fraction: number, cap: number): number {
  return Math.min(cap, Math.round(duration * fraction));
}

// ───────────── typography/blur-slide ─────────────
/**
 * Editorial title: the words rise out of a blur one by one over the darkened
 * picture, a hairline draws in above, and the whole page pushes in 3% (smooth).
 */
export function BlurSlideTitle({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const d = clip.durationInFrames;
  const text = clip.caption?.text ?? "";
  const push = 1 + 0.03 * ramp(frame, 0, d, EASE.smooth);
  const rule = ramp(frame, 0, 24, EASE.snappy);
  const left = width * 0.088;
  return (
    <AbsoluteFill>
      <Camera scale={1 + 0.02 * ramp(frame, 0, d, EASE.smooth)} filter="brightness(0.42) saturate(0.85)">
        <Picture src={src} />
      </Camera>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%)" }} />
      <div
        style={{
          position: "absolute",
          left,
          top: height * 0.24,
          width: (width - left * 2) * rule,
          height: 2,
          background: "rgba(255,255,255,0.45)",
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: `0 ${left}px`,
          transform: `scale(${push.toFixed(5)})`,
          transformOrigin: `${left}px 55%`,
        }}
      >
        <BlurSlideWords
          text={text}
          emphasis={clip.caption?.emphasis}
          start={8}
          revealFrames={Math.max(14, Math.min(40, d * 0.45))}
          wordFrames={22}
          lift={base * 0.06}
          blur={18}
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: base * 0.11 * lengthScale(text),
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            color: "#fff",
            maxWidth: "100%",
          }}
          emphasisStyle={{ fontStyle: "italic" }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ───────────── typography/marker-underline-title ─────────────
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A marker stroke: slightly wobbly centre line, thin start, full middle, tapered end. */
function markerPath(len: number, seed: number): string {
  const rand = mulberry32(seed);
  const n = 40;
  const top: string[] = [];
  const bottom: string[] = [];
  const wobble = Array.from({ length: n + 1 }, () => rand() - 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len;
    const mid = 19 - t * 9 + Math.sin(t * Math.PI * 1.6 + 0.4) * 2.6 + wobble[i]! * 1.6;
    const w = Math.max(2.2, 14 + Math.sin(t * Math.PI) * 6 - Math.max(0, t - 0.86) * 46 - Math.max(0, 0.06 - t) * 70 + wobble[i]! * 3);
    top.push(`${x.toFixed(1)},${(mid - w / 2).toFixed(1)}`);
    bottom.push(`${x.toFixed(1)},${(mid + w / 2).toFixed(1)}`);
  }
  return `M${top.join("L")}L${bottom.reverse().join("L")}Z`;
}
const MARKER_LEN = 252;
const MARKER_PATH = markerPath(MARKER_LEN, 77);

/**
 * Bold title on a warm paper card; once it lands, a dry marker stroke draws
 * under the key word (the emphasis, else the last word) left to right.
 */
export function MarkerTitle({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = clip.durationInFrames;
  const text = clip.caption?.text ?? "";
  const words = text.split(/\s+/).filter(Boolean);
  const marked = emphasisIndexes(words, clip.caption?.emphasis);
  if (marked.size === 0 && words.length > 0) marked.add(words.length - 1);
  const drawStart = at(d, 0.35, 32);
  const draw = clamp01((frame - drawStart) / 10);
  const drawE = 1 - Math.pow(1 - draw, 2.2);
  const settle = ramp(frame, 0, 22, EASE.snappy);
  const push = 1 + 0.015 * ramp(frame, 0, d, EASE.smooth);
  return (
    <AbsoluteFill style={{ background: "#f3efe6" }}>
      {src && (
        <AbsoluteFill style={{ filter: "blur(24px) saturate(0.6)", opacity: 0.35, transform: "scale(1.1)" }}>
          <Still src={src} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 70% at 45% 35%, rgba(255,255,255,0.55), rgba(243,239,230,0) 70%)" }} />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: base * 0.09, transform: `scale(${push})` }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            columnGap: "0.28em",
            textAlign: "center",
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: base * 0.095 * lengthScale(text),
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "#17181c",
            opacity: Math.min(1, settle * 1.4),
            transform: `translateY(${((1 - settle) * base * 0.035).toFixed(2)}px)`,
            filter: settle < 0.999 ? `blur(${((1 - settle) * 8).toFixed(2)}px)` : undefined,
          }}
        >
          {words.map((word, i) => (
            <span key={i} style={{ position: "relative", display: "inline-block", fontStyle: marked.has(i) ? "italic" : undefined }}>
              {word}
              {marked.has(i) && draw > 0 && (
                <svg
                  viewBox={`0 0 ${MARKER_LEN} 44`}
                  preserveAspectRatio="none"
                  style={{ position: "absolute", left: "-6%", bottom: "-0.32em", width: "112%", height: "0.42em", overflow: "visible", mixBlendMode: "multiply" }}
                >
                  <defs>
                    <clipPath id={`reveal-${uid}-${i}`}>
                      <rect x={0} y={-20} width={drawE * (MARKER_LEN + 6)} height={84} />
                    </clipPath>
                    <filter id={`dry-${uid}-${i}`} x="-5%" y="-40%" width="110%" height="180%" colorInterpolationFilters="sRGB">
                      <feTurbulence type="fractalNoise" baseFrequency="0.09 0.5" numOctaves={2} seed={7} result="warp" />
                      <feDisplacementMap in="SourceGraphic" in2="warp" scale={1.8} xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                  </defs>
                  <g clipPath={`url(#reveal-${uid}-${i})`}>
                    <path d={MARKER_PATH} fill={ACCENT} fillOpacity={0.85} filter={`url(#dry-${uid}-${i})`} />
                  </g>
                </svg>
              )}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ───────────── opening/text-as-mask ─────────────
/**
 * A giant word is a window onto the picture: it wipes up from its baseline,
 * the picture drifts inside it, then (on longer clips) the word inhales and
 * the camera dives through the letters into the full picture.
 */
export function TextMask({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const d = clip.durationInFrames;
  const text = clip.caption?.text ?? "";
  const words = text.split(/\s+/).filter(Boolean);
  const marked = [...emphasisIndexes(words, clip.caption?.emphasis)];
  const word = (marked.length ? marked.map((i) => words[i]).join(" ") : words.slice(0, 2).join(" ")).toLocaleUpperCase();
  const rest = marked.length ? text : words.slice(2).join(" ");
  const fontSize = Math.min(height * 0.42, (width * 0.9) / Math.max(1, word.length * 0.66));

  const wipe = ramp(frame, 0, 18, EASE.snappy);
  const land = mix(1.04, 1, ramp(frame, 0, 18, EASE.out));
  const dive = d >= 75;
  const inhaleAt = dive ? Math.round(d * 0.55) : d;
  const diveAt = inhaleAt + 8;
  const diveFrames = Math.max(12, Math.min(24, d - diveAt - 6));
  const inhale = mix(1, 0.965, ramp(frame, inhaleAt, 8, EASE.smooth));
  const diveT = clamp01((frame - diveAt) / diveFrames);
  const scale = dive && frame >= diveAt ? Math.exp(Math.log(0.965) + (Math.log(46) - Math.log(0.965)) * Math.pow(diveT, 1.8)) : land * inhale;
  const takeover = dive ? ramp(frame, diveAt + diveFrames * 0.7, diveFrames * 0.4, EASE.out) : 0;
  const drift = mix(8, -8, ramp(frame, 0, d, EASE.smooth));
  const subtitle = ramp(frame, 12, 18, EASE.out) * (1 - ramp(frame, inhaleAt, 8, EASE.exit));

  return (
    <AbsoluteFill style={{ background: "#eef0f3" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 70% at 45% 35%, #ffffff, #e4e7ec 80%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `scale(${scale.toFixed(4)})` }}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 900,
            fontSize,
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            whiteSpace: "nowrap",
            color: src ? "transparent" : "#111827",
            backgroundImage: src ? `url("${src}")` : undefined,
            backgroundSize: "cover",
            backgroundPosition: `${50 + drift}% 50%`,
            WebkitBackgroundClip: src ? "text" : undefined,
            backgroundClip: src ? "text" : undefined,
            clipPath: `inset(${((1 - wipe) * 100).toFixed(2)}% 0 0 0)`,
            filter: "drop-shadow(0 18px 30px rgba(30,40,60,0.18))",
          }}
        >
          {word}
        </div>
      </AbsoluteFill>
      {rest && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.12 }}>
          <div
            style={{
              maxWidth: "80%",
              textAlign: "center",
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: base * 0.036 * lengthScale(rest),
              color: "#30343c",
              opacity: subtitle,
              transform: `translateY(${((1 - subtitle) * 16).toFixed(1)}px)`,
            }}
          >
            {rest}
          </div>
        </AbsoluteFill>
      )}
      {takeover > 0 && (
        <AbsoluteFill style={{ opacity: takeover }}>
          <Picture src={src} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

// ───────────── camera/crash-zoom-punch ─────────────
/**
 * Hold on the wide picture, pull back a breath, then slam 6 frames into the
 * subject (speed peaking on arrival, motion blur only there), one visible
 * damped bounce, a warm exposure flash and the edges sinking into shadow.
 */
export function CrashZoom({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const d = clip.durationInFrames;
  const hold = at(d, 0.3, 34);
  const punchStart = hold + 6;
  const punchEnd = punchStart + 6;
  let scale: number;
  let blur = 0;
  if (frame < hold) {
    scale = mix(1, 1.02, ramp(frame, 0, hold, EASE.smooth));
  } else if (frame < punchStart) {
    scale = mix(1.02, 0.97, ramp(frame, hold, 6, EASE.smooth));
  } else if (frame < punchEnd) {
    const t = (frame - punchStart) / 6;
    const eased = Math.pow(t, 2.4);
    scale = Math.exp(mix(Math.log(0.97), Math.log(2.48), eased));
    blur = 6 * t;
  } else {
    const t = frame - punchEnd;
    scale = 2.34 + 0.14 * Math.exp(-t / 4) * Math.cos(t * 0.75);
  }
  const flash = frame >= punchEnd ? Math.max(0, 1 - (frame - punchEnd) / 8) * 0.45 : 0;
  const isolate = ramp(frame, punchEnd + 1, 16, EASE.out);
  return (
    <AbsoluteFill>
      <Camera scale={scale} filter={blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined}>
        <Picture src={src} />
      </Camera>
      <Vignette strength={0.15 + 0.5 * isolate} inner={0.4} />
      {flash > 0 && <AbsoluteFill style={{ background: "#ffd9a8", mixBlendMode: "screen", opacity: flash }} />}
    </AbsoluteFill>
  );
}

// ───────────── rhythm/rhythm-interrupt-moves (jump-cut-punch-in) ─────────────
/**
 * Three hard jumps closer on the same framing — 1.0×, 1.6×, 2.6× with zero
 * in-between — each cut ticked by a 2-frame darkening pulse; a slight drift
 * inside each step keeps the hold alive, the vignette tightens per step.
 */
export function JumpCut({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const d = clip.durationInFrames;
  const jump1 = at(d, 0.28, 35);
  const jump2 = at(d, 0.56, 70);
  const step = frame < jump1 ? 0 : frame < jump2 ? 1 : 2;
  const steps = [1, 1.6, 2.6];
  const drift =
    step === 0
      ? mix(1, 1.008, ramp(frame, 0, jump1, EASE.smooth))
      : step === 1
        ? mix(1, 1.008, ramp(frame, jump1, jump2 - jump1, EASE.smooth))
        : mix(1, 1.008, ramp(frame, jump2, 16, EASE.out));
  const pulse = (frame >= jump1 && frame <= jump1 + 1) || (frame >= jump2 && frame <= jump2 + 1);
  return (
    <AbsoluteFill>
      <Camera scale={steps[step]! * drift} filter={pulse ? "brightness(0.92)" : undefined}>
        <Picture src={src} />
      </Camera>
      <Vignette strength={[0.1, 0.18, 0.28][step]!} inner={0.5} />
    </AbsoluteFill>
  );
}

// ───────────── camera/tension-camera-moves (pull-back-isolation) ─────────────
/**
 * Open tight on the subject and slowly pull back (2.2× → 1×, ease-out),
 * while the surroundings sink into a cool dark field — the subject left
 * alone in the middle of the frame.
 */
export function PullBack({ clip, src }: ShotProps) {
  const frame = useCurrentFrame();
  const d = clip.durationInFrames;
  const travel = Math.max(1, Math.min(110, Math.round(d * 0.75)));
  const scale = mix(2.2, 1, ramp(frame, 0, travel, EASE.out));
  const sink = ramp(frame, Math.round(travel * 0.55), Math.round(travel * 0.45), EASE.smooth);
  if (!src) return <Backdrop />;
  return (
    <AbsoluteFill style={{ background: "#111216" }}>
      <Camera scale={scale}>
        <Still src={src} />
      </Camera>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 55% 55% at 50% 47%, rgba(17,18,22,0) 35%, rgba(17,18,22,${(0.85 * sink).toFixed(3)}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}
