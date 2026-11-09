import { findImagesTask } from "./find-images.js";
import { imagePromptTask } from "./image-prompt.js";
import { searchQueryTask } from "./search-query.js";
import { webResearchTask } from "./web-research.js";

/** Every AI task of the assets step (drives Settings → Prompts). */
export const assetTasks = [searchQueryTask, webResearchTask, imagePromptTask, findImagesTask];

export { findImagesTask, imagePromptTask, searchQueryTask, webResearchTask };
