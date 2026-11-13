// Easing curves and the frame-ramp helper, adapted from video-shotcraft
// (demos/_fixtures/Polish.tsx, Apache License 2.0 — see renderer/NOTICE).
// Changed: trimmed to the helpers Sunbee's shots use, typed for this project.

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** cubic-bezier(x1,y1,x2,y2) → (t) => number, same meaning as CSS (Newton-Raphson, bisection fallback). */
export const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  if (x1 === y1 && x2 === y2) return (t: number) => clamp01(t);
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-7) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sy(solve(t)));
};

/** Named presets: entrances (snappy/out), repositioning (smooth/swift), exits (exit). */
export const EASE = {
  snappy: bezier(0.16, 1, 0.3, 1),
  out: bezier(0.22, 1, 0.36, 1),
  smooth: bezier(0.65, 0, 0.35, 1),
  swift: bezier(0.4, 0, 0.2, 1),
  exit: bezier(0.7, 0, 0.84, 0),
};

/** 0→1 progress of a `dur`-frame move starting at `start`, eased. */
export const ramp = (frame: number, start: number, dur: number, ease: (t: number) => number = EASE.snappy) =>
  ease(clamp01((frame - start) / Math.max(1e-6, dur)));

export const SANS = '"Be Vietnam Pro", "Noto Sans", "DejaVu Sans", "Segoe UI", Roboto, Arial, sans-serif';
export const SERIF = '"Noto Serif", "DejaVu Serif", Georgia, serif';
export const ACCENT = "#ff7a3d";

/** Word indexes of the first occurrence of `phrase` in `words` (case/punctuation-insensitive). */
export function emphasisIndexes(words: string[], phrase: string | undefined): Set<number> {
  const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const target = (phrase ?? "").split(/\s+/).map(norm).filter(Boolean);
  if (target.length === 0) return new Set();
  const plain = words.map(norm);
  for (let i = 0; i + target.length <= plain.length; i++) {
    if (target.every((w, j) => plain[i + j] === w)) {
      return new Set(target.map((_, j) => i + j));
    }
  }
  return new Set();
}
