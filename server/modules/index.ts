import type { AiTaskDefinition } from "../services/ai/task.js";
import { assetsModule } from "./assets/index.js";
import { editPlanModule } from "./edit-plan/index.js";
import { renderModule } from "./render/index.js";
import { scriptModule } from "./script/index.js";
import { trainingModule } from "./training/index.js";
import { voiceoverModule } from "./voiceover/index.js";
import { videoRenderModule } from "./video-render/index.js";
import type { FeatureModule, StepModule } from "./types.js";

/** Every Video Studio step, in pipeline order. */
export const stepModules: StepModule[] = [scriptModule, assetsModule, editPlanModule, renderModule];

/** Features outside the pipeline, each with its own API and AI tasks. */
export const featureModules: FeatureModule[] = [trainingModule, voiceoverModule, videoRenderModule];

/** All AI tasks: steps in pipeline order, then features. */
export function allAiTasks(): AiTaskDefinition[] {
  return [...stepModules, ...featureModules].flatMap((module) => module.tasks);
}

export function findAiTask(key: string): AiTaskDefinition | undefined {
  return allAiTasks().find((task) => task.key === key);
}
