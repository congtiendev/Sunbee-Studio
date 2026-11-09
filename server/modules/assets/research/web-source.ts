import type { AssetCandidate } from "../../../../shared/types.js";
import { firstAvailableProvider, runTask } from "../../../services/ai/task.js";
import type { ResearchSource } from "../../../services/research/types.js";
import { webResearchTask } from "../tasks/web-research.js";

/** AI web search (OpenAI or Claude, whichever key the user has). Returns cited pages + a summary. */
export const webSource: ResearchSource = {
  key: "web",
  label: "Web (AI)",
  kind: "ai",
  mediaTypes: ["link"],
  requiresKey: false,

  isAvailable: ({ ai }) => firstAvailableProvider(ai) !== null,

  async search({ query }, { ai, description, sceneContext }) {
    const provider = firstAvailableProvider(ai);
    if (!provider) {
      throw new Error("Cần OpenAI hoặc Anthropic API key để research trên web. Vào Settings để nhập key.");
    }
    const result = await runTask(
      webResearchTask,
      { query, description, sceneContext, provider },
      ai,
    );
    const candidates: AssetCandidate[] = result.sources.map((source) => ({
      sourceKey: "web",
      externalId: source.url,
      mediaType: "link",
      title: source.title || source.url,
      url: source.url,
      pageUrl: source.url,
    }));
    return { candidates, summary: result.text };
  },
};
