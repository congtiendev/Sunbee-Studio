import { findImagesTask } from "./find-images.js";
import { imagePromptTask } from "./image-prompt.js";
import { searchQueryTask } from "./search-query.js";
import { splitLayersTask } from "./split-layers.js";
import { webResearchTask } from "./web-research.js";

/** Every AI task of the assets step (drives Settings → Prompts). */
export const assetTasks = [
  searchQueryTask,
  webResearchTask,
  imagePromptTask,
  findImagesTask,
  splitLayersTask,
];

export { findImagesTask, imagePromptTask, searchQueryTask, splitLayersTask, webResearchTask };
