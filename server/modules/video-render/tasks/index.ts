import type { AiTaskDefinition } from "../../../services/ai/task.js";
import { splitRenderScenesTask } from "./split-scenes.js";

/** Writing the script reuses the Studio's script-source tasks; splitting it into on-screen scenes is this module's own. */
export const videoRenderTasks: AiTaskDefinition[] = [splitRenderScenesTask];
