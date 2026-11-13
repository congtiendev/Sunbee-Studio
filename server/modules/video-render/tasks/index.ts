import type { AiTaskDefinition } from "../../../services/ai/task.js";
import { directRenderTask } from "./direct.js";
import { splitRenderScenesTask } from "./split-scenes.js";

/**
 * Writing the script reuses the Studio's script-source tasks. Splitting it
 * into scenes is this module's own: with Claude, the video-shotcraft skill
 * directs (`direct`); without it, a plain structured split (`splitScenes`).
 */
export const videoRenderTasks: AiTaskDefinition[] = [directRenderTask, splitRenderScenesTask];
