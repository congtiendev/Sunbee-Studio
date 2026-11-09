import { registerResearchSource } from "../../services/research/registry.js";
import type { StepModule } from "../types.js";
import { librarySource } from "./research/library-source.js";
import { webSource } from "./research/web-source.js";
import router from "./routes.js";
import { assetTasks } from "./tasks/index.js";

// The assets step contributes two research sources besides the stock sites.
registerResearchSource(librarySource);
registerResearchSource(webSource);

/** Step 2 — gather the media each scene needs: research, pick, and keep a library. */
export const assetsModule: StepModule = {
  key: "assets",
  mountPath: "assets",
  router,
  tasks: assetTasks,
};
