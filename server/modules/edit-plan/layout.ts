import type { CameraMovement } from "../../../shared/types.js";
import type { ClipTransform, TimelineKeyframe } from "../../../shared/timeline.js";

/**
 * Where a cutout sits and how the camera moves — the numeric half of the
 * edit plan, derived from the analysis' words until an AI layout pass
 * replaces the guesses (positions stay editable in CapCut either way).
 *
 * Units are the timeline's: position ±1 = canvas edge (y down), scale 1 =
 * the media fitted by its clip's `fit`.
 */

export interface CutoutPlacement {
  x: number;
  y: number;
  /** Size of the subject as a share of the canvas, along `axis`. */
  size: number;
  axis: "width" | "height";
  /** The text gave a size; false = a default guess. */
  sized: boolean;
  /** "dưới dòng “X”": sits right under the element whose description quotes X (a column of text lines). */
  below?: string;
  /** "căn lề trái cùng cột": left edge lined up with the element it sits under. */
  alignLeft: boolean;
}

const WORD_SHARES: Record<string, number> = {
  "ba phần tư": 0.75,
  "hai phần ba": 2 / 3,
  "một nửa": 0.5,
  nửa: 0.5,
  "một phần ba": 1 / 3,
  "một phần tư": 0.25,
};

/** First match of any pattern, by position in the text (-1: none). */
function firstAt(text: string, patterns: RegExp[]): number {
  const hits = patterns.map((re) => text.search(re)).filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

/**
 * The subject's size: the first "1/3", "80%", "một nửa"… that is a size —
 * not "góc 3/4" (a three-quarter view) or "nửa dưới" (a position) — and the
 * axis named next to it ("chiều rộng" → width, else height).
 */
function parseSize(text: string): { size: number; axis: CutoutPlacement["axis"] } | null {
  const token = /(\d+(?:[.,]\d+)?)\s*%|(\d+)\s*\/\s*(\d+)|(ba phần tư|hai phần ba|một phần ba|một phần tư|một nửa|nửa)/g;
  for (const match of text.matchAll(token)) {
    const at = match.index;
    const before = text.slice(Math.max(0, at - 6), at);
    const after = text.slice(at + match[0].length, at + match[0].length + 30);
    if (/góc\s*$/.test(before)) continue; // "góc 3/4" = a three-quarter view
    // "mỗi bong bóng khoảng 1/6…": the size of each thing inside the picture, not of the picture.
    if (/mỗi\s+[^,;]{0,25}$/.test(text.slice(Math.max(0, at - 30), at))) continue;
    if (match[4] === "nửa" && /^\s*(trên|dưới|trái|phải|người|thân|mặt)/.test(after)) continue;
    const value = match[1]
      ? Number(match[1].replace(",", ".")) / 100
      : match[2]
        ? Number(match[2]) / Number(match[3])
        : WORD_SHARES[match[4]!]!;
    if (!(value > 0 && value <= 1)) continue;
    const near = text.slice(Math.max(0, at - 20), at + match[0].length + 25);
    const axis = /rộng|ngang/.test(after.slice(0, 25)) || (!/cao/.test(near) && /rộng|ngang/.test(near)) ? "width" : "height";
    return { size: value, axis };
  }
  return null;
}

/** Reads "ở góc trái…", "chiếm khoảng 1/3 chiều rộng khung"… out of a cutout's placement text. */
export function parsePlacement(text: string | undefined): CutoutPlacement {
  // Clauses about light and shadow ("bóng đổ về phía dưới trái") say nothing about position.
  const t = (text ?? "")
    .normalize("NFC")
    .toLowerCase()
    .split(/[,;.]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause && !/bóng đổ|đổ bóng|nắng|ánh sáng|nguồn sáng/.test(clause))
    .join(", ");

  // Horizontal: whichever side is named first ("quay sang trái" is facing, not position);
  // "hơi lệch phải" is a nudge, and wins over a hand or prop mentioned later.
  const nudgeLeft = firstAt(t, [/lệch (sang )?trái/]);
  const nudgeRight = firstAt(t, [/lệch (sang )?phải/]);
  const left = firstAt(t, [/(bên|phía|góc|mép|nửa)( \S+)? trái/, /trái khung/]);
  const right = firstAt(t, [/(bên|phía|góc|mép|nửa)( \S+)? phải/, /phải khung/]);
  const x =
    nudgeLeft >= 0 || nudgeRight >= 0
      ? nudgeLeft >= 0 && (nudgeRight < 0 || nudgeLeft < nudgeRight)
        ? -0.15
        : 0.15
      : left >= 0 && (right < 0 || left < right)
        ? -0.45
        : right >= 0
          ? 0.45
          : 0;

  const sized = parseSize(t);
  const size =
    sized?.size ??
    (/phần lớn|gần kín|kín khung|khắp khung|toả ra (?:bốn phía|khắp)|về (?:các |bốn )?mép khung/.test(t) ? 0.8 : 0.45);
  const axis = sized?.axis ?? "height";

  // Vertical: an explicit top/bottom position, else centred, else resting a little low.
  const top = firstAt(t, [/phía trên khung|góc trên|nửa trên|trên cùng|mép trên|phía trên/]);
  const bottom = firstAt(t, [/nửa dưới|góc (\S+ )?dưới|phía dưới khung|dưới cùng/]);
  let y = 0.1;
  if (/giữa khung|chính giữa|trung tâm|căn giữa/.test(t)) y = 0;
  if (top >= 0 && (bottom < 0 || top < bottom)) y = -0.55;
  else if (bottom >= 0) y = 0.45;
  // "chân chạm mép dưới", "vai cắt ở mép dưới": the subject stands on the bottom edge.
  if (/(chân|vai|ngực|hông|thân).{0,25}(mép dưới|đáy)|mép dưới cắt|sát đáy|chạm (gần )?mép dưới/.test(t) && axis === "height") {
    y = Math.max(-1, 1 - size);
  }
  const below = /dưới (?:dòng|chữ|câu)\s*[“"]([^”"]+)[”"]/.exec(t)?.[1];
  return { x, y, size, axis, sized: sized !== null, below, alignLeft: /căn (?:lề )?trái/.test(t) };
}

/**
 * The scale that shows an image of `image` pixels at `placement.size` of the
 * canvas, given it's fitted with "contain" at scale 1.
 */
export function placementScale(
  placement: CutoutPlacement,
  image: { width: number; height: number },
  canvas: { width: number; height: number },
): number {
  const contain = Math.min(canvas.width / image.width, canvas.height / image.height);
  const shown = placement.axis === "width" ? image.width * contain : image.height * contain;
  const wanted = placement.size * (placement.axis === "width" ? canvas.width : canvas.height);
  return wanted / shown;
}

/**
 * How far inside the frame's edge a layer is kept (in half-canvas units):
 * pictures keep ~3% of the frame clear, text ~5% (title-safe).
 */
export const SAFE_EDGE = 0.94;
export const TEXT_SAFE_EDGE = 0.9;

/**
 * Keeps a "contain"-fitted layer entirely inside the frame: shrinks it when
 * it's bigger than the frame, then moves it in from any edge it crosses.
 * (A placement's position and size are read separately from words, so
 * "góc trên bên trái" + "80% chiều rộng" alone would hang off the side.)
 */
export function fitInside(
  base: ClipTransform,
  image: { width: number; height: number },
  canvas: { width: number; height: number },
  edge = SAFE_EDGE,
): ClipTransform {
  const contain = Math.min(canvas.width / image.width, canvas.height / image.height);
  // Half-extents at scale 1, in half-canvas units (±1 = edge).
  const halfW = (image.width * contain) / canvas.width;
  const halfH = (image.height * contain) / canvas.height;
  const largest = Math.max(halfW, halfH) * base.scale;
  const scale = largest > edge ? (base.scale * edge) / largest : base.scale;
  const roomX = Math.max(0, edge - halfW * scale);
  const roomY = Math.max(0, edge - halfH * scale);
  return {
    ...base,
    scale: round(scale),
    x: round(Math.min(roomX, Math.max(-roomX, base.x))),
    y: round(Math.min(roomY, Math.max(-roomY, base.y))),
  };
}

/** A layer's half-extents on screen (half-canvas units), "contain"-fitted at its scale. */
export function halfExtents(base: ClipTransform, image: { width: number; height: number }, canvas: { width: number; height: number }) {
  const contain = Math.min(canvas.width / image.width, canvas.height / image.height);
  return {
    hw: ((image.width * contain) / canvas.width) * base.scale,
    hh: ((image.height * contain) / canvas.height) * base.scale,
  };
}

/** Overlap of two boxes as a share of the smaller one (0 = apart, 1 = one inside the other). */
function overlapShare(
  a: { x: number; y: number; hw: number; hh: number },
  b: { x: number; y: number; hw: number; hh: number },
): number {
  const w = Math.min(a.x + a.hw, b.x + b.hw) - Math.max(a.x - a.hw, b.x - b.hw);
  const h = Math.min(a.y + a.hh, b.y + b.hh) - Math.max(a.y - a.hh, b.y - b.hh);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(4 * a.hw * a.hh, 4 * b.hw * b.hh);
}

/**
 * Moves a shot's layers apart when they'd pile on each other (two text
 * cards both read as "bên trái"): each layer, in order, takes the position
 * — its own, or just below/above/beside one it collides with — that overlaps
 * the earlier ones least while staying inside the frame. Small overlaps
 * (a hand over a prop) are fine and left alone. A grounded layer (a character
 * standing on, or cut off at, the bottom edge) only ever moves sideways and
 * shrinks towards its feet, so it never ends up floating.
 */
export function avoidOverlap(
  layers: {
    base: ClipTransform;
    size: { width: number; height: number };
    pinned?: boolean;
    grounded?: boolean;
    edge?: number;
  }[],
  canvas: { width: number; height: number },
): ClipTransform[] {
  const placed: { x: number; y: number; hw: number; hh: number }[] = [];
  return layers.map(({ base, size, pinned, grounded, edge = SAFE_EDGE }) => {
    const { hw, hh } = halfExtents(base, size, canvas);
    // Placed deliberately relative to another element (a line in a column): stays put.
    if (pinned) {
      placed.push({ x: base.x, y: base.y, hw, hh });
      return base;
    }
    // Try moving it next to what it collides with, or shrinking it (up to
    // twice): whatever overlaps least, counting moving far and shrinking a lot
    // as costs too — a title over a presenter's head is fixed by making the
    // presenter a little smaller, not by shoving them into a corner.
    let shrink = 1;
    let best = { x: base.x, y: base.y, cost: Infinity, shrink };
    let bestScore = Infinity;
    for (let attempt = 0; attempt < 3; attempt++, shrink *= 0.8) {
      const w = hw * shrink;
      const h = hh * shrink;
      const rx = Math.max(0, edge - w);
      const ry = Math.max(0, edge - h);
      // Grounded: the bottom edge stays where it was as it shrinks.
      const groundY = base.y + hh - h;
      const cost = (x: number, y: number) =>
        placed.reduce((sum, other) => sum + overlapShare({ x, y, hw: w, hh: h }, other), 0);
      const own: [number, number] = [
        Math.max(-rx, Math.min(rx, base.x)),
        grounded ? groundY : Math.max(-ry, Math.min(ry, base.y)),
      ];
      const candidates: [number, number][] = [own];
      // Either side of the frame: two people in a shot stand apart.
      candidates.push([-rx, own[1]], [rx, own[1]]);
      for (const other of placed) {
        candidates.push(
          [other.x + other.hw + w + 0.02, own[1]],
          [other.x - other.hw - w - 0.02, own[1]],
        );
        if (!grounded) {
          candidates.push([base.x, other.y + other.hh + h + 0.02], [base.x, other.y - other.hh - h - 0.02]);
        }
      }
      for (const [x, y] of candidates) {
        if (Math.abs(x) > rx + 1e-6 || (!grounded && Math.abs(y) > ry + 1e-6)) continue;
        const c = cost(x, y);
        const score = (c <= 0.1 ? 0 : c) + 0.3 * Math.hypot(x - base.x, y - base.y) + 0.6 * (1 - shrink);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, cost: c, shrink };
        }
      }
      if (best.cost <= 0.1 && best.shrink === 1 && best.x === own[0] && best.y === own[1]) break;
    }
    placed.push({ x: best.x, y: best.y, hw: hw * best.shrink, hh: hh * best.shrink });
    return { ...base, scale: round(base.scale * best.shrink), x: round(best.x), y: round(best.y) };
  });
}

/** On-screen area of a layer (half-canvas units²) — to tell the main subject from small props. */
export function screenArea(
  base: ClipTransform,
  image: { width: number; height: number },
  canvas: { width: number; height: number },
): number {
  const { hw, hh } = halfExtents(base, image, canvas);
  return hw * hh;
}

/** A slow push-in over a shot that would otherwise hold perfectly still. */
export function driftKnots(durationMs: number, gain: number): CameraKnot[] {
  return [
    { atMs: 0, s: 1, cx: 0, cy: 0 },
    { atMs: durationMs, s: 1 + gain, cx: 0, cy: 0 },
  ];
}

/** A full-frame image whose shape is far from the canvas' (a 3:1 strip on 16:9): cropping it to cover would cut it apart. */
export function badCoverFit(image: { width: number; height: number }, canvas: { width: number; height: number }): boolean {
  return Math.abs(Math.log(image.width / image.height / (canvas.width / canvas.height))) > Math.log(1.3);
}

// ---------- camera ----------

/** The camera at one moment: everything in frame is scaled by `s` about the centre, then shifted by (cx, cy). */
interface CameraKnot {
  atMs: number;
  s: number;
  cx: number;
  cy: number;
}

/**
 * A shot's camera move as knots (linear between them). Gentle by default:
 * zoom grows with the shot's length up to 10%, and a pan/tilt only travels
 * within the room that zoom gives, so a full-frame background never shows
 * its edge. `seed` varies direction from shot to shot.
 */
export function cameraKnots(
  movement: CameraMovement,
  durationMs: number,
  seed: number,
  intensity = 1,
): CameraKnot[] {
  if (intensity <= 0) return [];
  const sec = durationMs / 1000;
  const a = Math.min(0.1, 0.03 + 0.01 * sec) * intensity;
  const dir = seed % 2 === 0 ? 1 : -1;
  const travel = a * 0.6 * dir;
  const end = durationMs;
  switch (movement) {
    case "zoom":
      return [
        { atMs: 0, s: 1, cx: 0, cy: 0 },
        { atMs: end, s: 1 + a, cx: 0, cy: 0 },
      ];
    case "pan":
      return [
        { atMs: 0, s: 1 + a, cx: travel, cy: 0 },
        { atMs: end, s: 1 + a, cx: -travel, cy: 0 },
      ];
    case "tilt":
      return [
        { atMs: 0, s: 1 + a, cx: 0, cy: travel },
        { atMs: end, s: 1 + a, cx: 0, cy: -travel },
      ];
    case "tracking":
      return [
        { atMs: 0, s: 1 + a / 2, cx: travel / 2, cy: 0 },
        { atMs: end, s: 1 + a, cx: -travel, cy: 0 },
      ];
    case "handheld": {
      // A slow, small wobble inside a 4% zoom.
      const wobble = [0, 0.006, -0.004, 0.005, -0.006, 0.003];
      const steps = Math.max(2, Math.round(sec * 1.5));
      return Array.from({ length: steps + 1 }, (_, i) => ({
        atMs: Math.round((end * i) / steps),
        s: 1.04,
        cx: wobble[(i + seed) % wobble.length]!,
        cy: wobble[(i + seed + 2) % wobble.length]!,
      }));
    }
    default:
      return [];
  }
}

function cameraAt(knots: CameraKnot[], atMs: number): CameraKnot {
  if (knots.length === 0) return { atMs, s: 1, cx: 0, cy: 0 };
  const next = knots.findIndex((k) => k.atMs >= atMs);
  if (next === -1) return { ...knots.at(-1)!, atMs };
  if (next === 0) return { ...knots[0]!, atMs };
  const a = knots[next - 1]!;
  const b = knots[next]!;
  const t = (atMs - a.atMs) / Math.max(1, b.atMs - a.atMs);
  return { atMs, s: a.s + (b.s - a.s) * t, cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t };
}

const apply = (camera: CameraKnot, base: ClipTransform): Omit<ClipTransform, "rotation" | "opacity"> => ({
  x: camera.s * base.x + camera.cx,
  y: camera.s * base.y + camera.cy,
  scale: camera.s * base.scale,
});

const round = (v: number) => Math.round(v * 10000) / 10000;

/** How a layer comes on screen, starting at the clip's first frame. */
export interface LayerIntro {
  kind: "pop" | "fade";
  durationMs: number;
}

/**
 * The intro's effect `t` ms into it: size factor and opacity. A pop starts
 * at 30% and see-through, overshoots to 105% at two thirds of the way and
 * settles at 100% (measured: ~4 frames); a fade only ramps opacity.
 */
function introAt(intro: LayerIntro | undefined, t: number): { scale: number; opacity: number } {
  if (!intro || intro.durationMs <= 0 || t >= intro.durationMs) return { scale: 1, opacity: 1 };
  const p = Math.max(0, t / intro.durationMs);
  if (intro.kind === "fade") return { scale: 1, opacity: p };
  const peak = 2 / 3;
  return p <= peak
    ? { scale: 0.3 + (1.05 - 0.3) * (p / peak), opacity: Math.min(1, p / peak) }
    : { scale: 1.05 - 0.05 * ((p - peak) / (1 - peak)), opacity: 1 };
}

/**
 * A layer during [fromMs, toMs) of its shot — seen through the shot's camera
 * (the same for every layer, so background and cutouts move as one picture)
 * and, when it has one, playing its intro from the clip's first frame. Gives
 * the starting transform and keyframes (relative to the clip).
 */
export function animateLayer(
  knots: CameraKnot[],
  base: ClipTransform,
  fromMs: number,
  toMs: number,
  intro?: LayerIntro,
): { transform: ClipTransform; keyframes?: TimelineKeyframe[] } {
  const at = (t: number) => {
    const camera = apply(cameraAt(knots, t), base);
    const effect = introAt(intro, t - fromMs);
    return {
      x: round(camera.x),
      y: round(camera.y),
      scale: round(camera.scale * effect.scale),
      opacity: round(base.opacity * effect.opacity),
    };
  };
  const first = at(fromMs);
  const transform = { ...base, ...first };
  const introTimes =
    intro && intro.durationMs > 0
      ? [fromMs + Math.round((intro.durationMs * 2) / 3), fromMs + intro.durationMs].filter((t) => t < toMs)
      : [];
  if (knots.length === 0 && introTimes.length === 0) return { transform };
  const times = [
    ...new Set([fromMs, ...introTimes, ...knots.map((k) => k.atMs).filter((t) => t > fromMs && t < toMs), toMs]),
  ].sort((a, b) => a - b);
  const keyframes = times.map((t) => {
    const value = at(t);
    return {
      atMs: t - fromMs,
      x: value.x,
      y: value.y,
      scale: value.scale,
      // Opacity keyframes only when something fades.
      ...(introTimes.length ? { opacity: value.opacity } : {}),
    };
  });
  return { transform, keyframes };
}
