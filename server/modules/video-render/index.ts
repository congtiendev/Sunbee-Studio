import type { FeatureModule } from "../types.js";
import router from "./routes.js";
import { videoRenderTasks } from "./tasks/index.js";

/**
 * A self-contained video maker, independent of the Video Studio: each render
 * project has its own script (pasted, or written by AI from an idea), its own
 * AI scene breakdown, picked images and audio, rendered to MP4 with Remotion
 * (`renderer/`). Inspired by github.com/Vincentwei1021/video-shotcraft's use
 * of Remotion, but with a small fixed shot catalog and a plain-data timeline
 * instead of per-video LLM-authored code.
 */
export const videoRenderModule: FeatureModule = {
  key: "videoRender",
  mountPath: "video-render",
  router,
  tasks: videoRenderTasks,
};
