import type { AiTaskDefinition } from "../services/ai/task.js";
import { assetsModule } from "./assets/index.js";
import { editPlanModule } from "./edit-plan/index.js";
import { renderModule } from "./render/index.js";
import { scriptModule } from "./script/index.js";
import type { StepModule } from "./types.js";

/** Every Video Studio step, in pipeline order. */
export const stepModules: StepModule[] = [scriptModule, assetsModule, editPlanModule, renderModule];

/** All AI tasks across steps, in pipeline order. */
export function allAiTasks(): AiTaskDefinition[] {
  return stepModules.flatMap((module) => module.tasks);
}

export function findAiTask(key: string): AiTaskDefinition | undefined {
  return allAiTasks().find((task) => task.key === key);
}
