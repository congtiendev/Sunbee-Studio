import { registerResearchSource } from "../../services/research/registry.js";
import type { StepModule } from "../types.js";
import { aiImageCloudflareSource } from "./research/ai-image-cloudflare.js";
import { aiImageOpenAiSource } from "./research/ai-image-openai.js";
import { aiImageSearchClaudeSource } from "./research/ai-image-search-claude.js";
import { librarySource } from "./research/library-source.js";
import { webSource } from "./research/web-source.js";
import router from "./routes.js";
import { assetTasks } from "./tasks/index.js";

// The assets step contributes these research sources besides the stock
// sites: the internal library, AI web search, AI image generation
// (one file per source — see ./research/ai-image-cloudflare.ts for how to
// add another AI image provider), and AI image search (finds real images
// on the web instead of generating new ones).
registerResearchSource(librarySource);
registerResearchSource(webSource);
registerResearchSource(aiImageCloudflareSource);
registerResearchSource(aiImageOpenAiSource);
registerResearchSource(aiImageSearchClaudeSource);

/** Step 2 — gather the media each scene needs: research, pick, and keep a library. */
export const assetsModule: StepModule = {
  key: "assets",
  mountPath: "assets",
  router,
  tasks: assetTasks,
};
