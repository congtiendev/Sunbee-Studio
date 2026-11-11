/**
 * Crops an object image (a "cutout") down to its subject, so it carries no
 * empty margin into the edit. Runs in the browser on a canvas — no image
 * library needed.
 *
 * What counts as empty margin:
 * - transparent pixels, when the image has real transparency (corners see-through);
 * - otherwise a solid background: the colour all four corners share (ChatGPT
 *   sometimes hands back a white background instead of a transparent one).
 * An image with neither (a busy background reaching the corners) is left as is.
 *
 * Only a bounding box is cut — nothing inside it is ever removed. With real
 * transparency that can't eat into the subject. With a solid background it
 * can, if the subject's outermost edge has the background's colour (a white
 * phone on white), so that mode compares strictly and keeps a wider margin —
 * and callers keep the original so the user can put it back.
 */

/** Alpha at or below this is see-through. */
const EMPTY_ALPHA = 8;
/** Per-channel distance from the corner colour still counted as background (JPEG noise) — kept strict. */
const COLOR_TOLERANCE = 10;
/** Pixels kept around a subject cut out of transparency, so antialiased edges aren't clipped. */
const ALPHA_PADDING = 2;
/** Around a subject cut off a solid background: a share of the image's shorter side, as a safety margin. */
const COLOR_PADDING_SHARE = 0.02;

export interface TrimResult {
  file: File;
  /** False when nothing was cut (already tight, nothing recognisable as background, or unreadable). */
  trimmed: boolean;
}

type Pixel = [number, number, number, number];

export async function trimToSubject(file: File): Promise<TrimResult> {
  const unchanged: TrimResult = { file, trimmed: false };
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return unchanged;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  const at = (x: number, y: number): Pixel => {
    const i = (y * width + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
  };
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const close = (a: Pixel, b: Pixel) =>
    Math.abs(a[0] - b[0]) <= COLOR_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= COLOR_TOLERANCE &&
    Math.abs(a[2] - b[2]) <= COLOR_TOLERANCE &&
    Math.abs(a[3] - b[3]) <= COLOR_TOLERANCE;

  let isEmpty: (p: Pixel) => boolean;
  let padding: number;
  if (corners.some((p) => p[3] <= EMPTY_ALPHA)) {
    isEmpty = (p) => p[3] <= EMPTY_ALPHA;
    padding = ALPHA_PADDING;
  } else if (corners.every((p) => close(p, corners[0]!))) {
    const background = corners[0]!;
    isEmpty = (p) => close(p, background);
    padding = Math.max(ALPHA_PADDING, Math.round(Math.min(width, height) * COLOR_PADDING_SHARE));
  } else {
    return unchanged;
  }

  // The subject's bounding box.
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isEmpty(at(x, y))) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return unchanged; // Nothing but background.

  const x0 = Math.max(0, left - padding);
  const y0 = Math.max(0, top - padding);
  const x1 = Math.min(width - 1, right + padding);
  const y1 = Math.min(height - 1, bottom + padding);
  const cropWidth = x1 - x0 + 1;
  const cropHeight = y1 - y0 + 1;
  if (cropWidth === width && cropHeight === height) return unchanged; // Already tight.

  const out = document.createElement("canvas");
  out.width = cropWidth;
  out.height = cropHeight;
  out.getContext("2d")!.drawImage(canvas, x0, y0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) return unchanged;
  return {
    file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" }),
    trimmed: true,
  };
}
