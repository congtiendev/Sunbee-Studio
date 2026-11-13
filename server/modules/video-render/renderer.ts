import { existsSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import { RENDER_COMPOSITION_ID, type RenderInputProps } from "../../../shared/render.js";

/**
 * The Remotion project is bundled from source at runtime, so it has to be on
 * disk next to the server — true for `npm run dev` and a plain server
 * deploy, not yet for the packaged Electron app (see this module's notes).
 */
const ENTRY_POINT = path.join(process.cwd(), "renderer", "src", "index.ts");

let serveUrl: Promise<string> | null = null;

/** Bundled once per server process (the slow part, ~seconds); edits under renderer/ need a server restart. */
function bundledServeUrl(): Promise<string> {
  if (!existsSync(ENTRY_POINT)) {
    return Promise.reject(
      new Error("Không tìm thấy mã renderer (renderer/src) — xuất video hiện chỉ chạy khi chạy server từ mã nguồn."),
    );
  }
  const pending =
    serveUrl ??
    bundle({ entryPoint: ENTRY_POINT }).catch((err: unknown) => {
      serveUrl = null;
      throw err;
    });
  serveUrl = pending;
  return pending;
}

/**
 * Renders the manifest to an H.264 MP4 at `outputLocation`. Remotion fetches
 * its own headless Chrome on first use. Aborting `signal` stops the render.
 */
export async function renderToFile(
  inputProps: RenderInputProps,
  outputLocation: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = await bundledServeUrl();
  signal?.throwIfAborted();
  const composition = await selectComposition({ serveUrl: url, id: RENDER_COMPOSITION_ID, inputProps });
  const { cancelSignal, cancel } = makeCancelSignal();
  signal?.addEventListener("abort", () => cancel(), { once: true });
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    outputLocation,
    inputProps,
    cancelSignal,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}
