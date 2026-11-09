import type { StepModule } from "../types.js";
import router from "./routes.js";
import { scriptTasks } from "./tasks/index.js";

/** Step 1 — build the script: get a script from a source, then analyze it into scenes. */
export const scriptModule: StepModule = {
  key: "script",
  mountPath: "script",
  router,
  tasks: scriptTasks,
};
