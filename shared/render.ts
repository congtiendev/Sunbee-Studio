import type { RenderManifest } from "./types.js";

/** The one Remotion composition in `renderer/src` — what the server selects and renders. */
export const RENDER_COMPOSITION_ID = "MainVideo";

/**
 * What the server hands Remotion as `inputProps`: the manifest (file ids
 * only, as stored) plus a URL for each file id it references, reachable from
 * the headless browser doing the render.
 */
export type RenderInputProps = {
  manifest: RenderManifest;
  sources: Record<string, string>;
};
