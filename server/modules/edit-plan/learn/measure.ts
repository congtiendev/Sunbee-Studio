import { spawn } from "node:child_process";
import type { EditStyleMeasurements } from "../../../../shared/edit-plan.js";

/**
 * Measurements of a sample video's editing that don't need an AI: where it
 * cuts, how often something new appears between cuts, whether cuts land in
 * the voice's pauses, and whether music runs under the voice. ffmpeg only.
 */
export interface VideoMeasurements extends EditStyleMeasurements {
  cuts: number[];
  /** Visual changes between cuts (an element popping in, a text line appearing…). */
  reveals: number[];
}

function run(args: string[]): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err }));
  });
}

/** Times where the picture changes by more than `threshold` (ffmpeg scdet, 0–100). */
async function sceneChanges(path: string, threshold: number): Promise<number[]> {
  const { code, stderr } = await run([
    "-hide_banner",
    "-i",
    path,
    "-an",
    "-vf",
    `scale=480:-2,scdet=threshold=${threshold},metadata=mode=print:key=lavfi.scd.time`,
    "-f",
    "null",
    "-",
  ]);
  if (code !== 0) throw new Error("ffmpeg không đọc được video mẫu.");
  return [...stderr.matchAll(/lavfi\.scd\.time=([\d.]+)/g)].map((m) => Number(m[1]));
}

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]! : 0;
};
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Spectral flatness of `size` samples (0 = pure tones, ~1 = white noise). */
function flatness(samples: Float32Array, start: number, size: number): number {
  const mags: number[] = [];
  for (let f = 1; f < size / 2; f++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < size; t++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / (size - 1));
      const x = (samples[start + t] ?? 0) * w;
      re += x * Math.cos((2 * Math.PI * f * t) / size);
      im -= x * Math.sin((2 * Math.PI * f * t) / size);
    }
    mags.push(re * re + im * im + 1e-20);
  }
  const geometric = Math.exp(mags.reduce((sum, m) => sum + Math.log(m), 0) / mags.length);
  const arithmetic = mags.reduce((sum, m) => sum + m, 0) / mags.length;
  return geometric / arithmetic;
}

export async function measureVideo(path: string): Promise<VideoMeasurements> {
  // ---- picture: hard cuts, and smaller changes between them ----
  const cuts = await sceneChanges(path, 8);
  const changes = await sceneChanges(path, 1.2);

  // ---- sound: 20 ms loudness frames of a 16 kHz mono copy ----
  const audio = await run(["-hide_banner", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]);
  const pcm = audio.stdout;
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  const frame = 320;
  const db: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) sum += samples[i + j]! ** 2;
    db.push(10 * Math.log10(sum / frame + 1e-12));
  }
  const durationSec = db.length * 0.02 || cuts.at(-1) || 0;
  if (durationSec <= 0) throw new Error("Video mẫu không có âm thanh hoặc hình ảnh đọc được.");

  const speechDb = quantile(db, 0.75);
  const floorDb = quantile(db, 0.05);
  const pauseDb = speechDb - 12;
  const quietNear = (t: number) => {
    for (let d = -0.1; d <= 0.1001; d += 0.02) if ((db[Math.round((t + d) / 0.02)] ?? 0) < pauseDb) return true;
    return false;
  };
  const grid = Array.from({ length: 400 }, (_, i) => 2 + ((durationSec - 4) * (i + 0.5)) / 400);

  // Music under the voice: the pauses' sound is tonal (low flatness), not hiss.
  const pauses: number[] = [];
  let quiet = 0;
  for (let k = 0; k < db.length; k++) {
    quiet = db[k]! < pauseDb ? quiet + 1 : 0;
    if (quiet === 8) pauses.push((k - 7) * 0.02);
  }
  const probes = pauses.filter((_, i) => i % Math.max(1, Math.floor(pauses.length / 6)) === 0).slice(0, 6);
  const flatnesses = probes.map((t) => flatness(samples, Math.round(t * 16000), 1024));
  const musicLikely = floorDb > -60 && flatnesses.length > 0 && quantile(flatnesses, 0.5) < 0.15;

  // ---- pacing ----
  const bounds = [0, ...cuts, durationSec];
  const shots = bounds.slice(1).map((end, i) => end - bounds[i]!);
  const merged: number[] = [];
  for (const t of changes) if (!merged.length || t - merged.at(-1)! > 0.4) merged.push(t);
  const reveals = merged.filter((t) => !cuts.some((c) => Math.abs(c - t) < 0.4));
  const perShot = shots.map((_, i) => reveals.filter((t) => t > bounds[i]! && t < bounds[i + 1]!).length);
  const minutes = durationSec / 60;

  return {
    durationSec: round1(durationSec),
    shots: shots.length,
    shotSec: {
      mean: round1(durationSec / shots.length),
      median: round1(quantile(shots, 0.5)),
      p10: round1(quantile(shots, 0.1)),
      p90: round1(quantile(shots, 0.9)),
    },
    cutsPerMinute: round1(cuts.length / minutes),
    revealsPerMinute: round1(reveals.length / minutes),
    revealsPerShotP90: quantile(perShot, 0.9),
    cutInPausePct: cuts.length ? Math.round((cuts.filter(quietNear).length / cuts.length) * 100) : 0,
    pauseBaselinePct: Math.round((grid.filter(quietNear).length / grid.length) * 100),
    speechDb: round1(speechDb),
    floorDb: round1(floorDb),
    musicLikely,
    cuts,
    reveals,
  };
}
