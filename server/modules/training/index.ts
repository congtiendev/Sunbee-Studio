import type { FeatureModule } from "../types.js";
import router from "./routes.js";
import { trainingTasks } from "./tasks/index.js";

/**
 * AI training: learns skills (voice, style, knowledge) from videos and documents,
 * keeping a version of the skill per run. Not a pipeline step — the skills it
 * makes are used by the steps.
 */
export const trainingModule: FeatureModule = {
  key: "training",
  mountPath: "training",
  router,
  tasks: trainingTasks,
};
