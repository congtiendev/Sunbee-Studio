import type { StepModule } from "../types.js";
import router from "./routes.js";
import { learnStyleTask } from "./tasks/learn-style.js";

/**
 * Step 3 — lays the scenes, their shots and picked images out on a timeline
 * (`build-timeline.ts`) and exports it — today as a CapCut draft
 * (`server/services/capcut/`), later also rendered with ffmpeg.
 */
export const editPlanModule: StepModule = {
  key: "editPlan",
  mountPath: "edit-plan",
  router,
  tasks: [learnStyleTask],
};
