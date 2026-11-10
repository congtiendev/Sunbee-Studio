import { digestSourceTask } from "./digest-source.js";
import { trainGraphicsStyleTask } from "./train-graphics-style.js";
import { trainSkillTask } from "./train-skill.js";

/** Every AI task of AI training (drives its tab in Settings → Prompts). */
export const trainingTasks = [trainSkillTask, trainGraphicsStyleTask, digestSourceTask];

export { digestSourceTask, trainGraphicsStyleTask, trainSkillTask };
