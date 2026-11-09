import { searchQueryTask } from "./search-query.js";
import { webResearchTask } from "./web-research.js";

/** Every AI task of the assets step (drives Settings → Prompts). */
export const assetTasks = [searchQueryTask, webResearchTask];

export { searchQueryTask, webResearchTask };
