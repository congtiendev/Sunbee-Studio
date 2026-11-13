import { spawn } from "node:child_process";
import type { TimelineCanvas, VisualClip } from "../../../shared/timeline.js";

/**
 * Turns an image into one with EXACTLY the canvas's aspect ratio, so that
 * however CapCut places media by default (fit or fill — the same thing at
 * the canvas's own ratio), scale 1 shows it the way the timeline means:
 *
 * - "cover": scaled to cover the canvas and centre-cropped — the Người Que
 *   pipeline does this to every scene image before it goes into CapCut.
 * - "contain" / "none": padded with transparency to the canvas ratio, the
 *   image centred at the size the fit gives it (contain: as large as fits;
 *   none: its own pixel size on the canvas, or contain if that's larger).
 *   A cutout then sits at its timeline position via the clip's transform,
 *   and scales around its own centre.
 *
 * Output is always PNG (keeps cutout transparency).
 */
export async function prepareImage(
  source: { path: string; width: number; height: number },
  fit: VisualClip["fit"],
  canvas: TimelineCanvas,
  outPath: string,
): Promise<{ width: number; height: number }> {
  const { width: cw, height: ch } = canvas;
  if (fit === "cover") {
    await ffmpeg([
      "-i",
      source.path,
      "-vf",
      `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}`,
      "-frames:v",
      "1",
      outPath,
    ]);
    return { width: cw, height: ch };
  }

  const contain = Math.min(cw / source.width, ch / source.height);
  const pixelScale = fit === "none" ? Math.min(1, contain) : contain;
  // A padded image of canvas ratio fills the canvas exactly; its size is the
  // canvas divided by the pixel scale the image should be shown at.
  const padW = Math.max(source.width, Math.round(cw / pixelScale));
  const padH = Math.max(source.height, Math.round(ch / pixelScale));
  await ffmpeg([
    "-i",
    source.path,
    "-vf",
    `format=rgba,pad=${padW}:${padH}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    "-frames:v",
    "1",
    outPath,
  ]);
  return { width: padW, height: padH };
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim() || `exit ${code}`}`)),
    );
  });
}
