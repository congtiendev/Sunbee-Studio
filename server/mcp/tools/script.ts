import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod-mcp";
import { estimateAnalyzeScriptCost } from "../../../shared/script-cost-estimate.js";
import { fetchTranscriptFromVideoUrl } from "../../modules/script/media/fetch-transcript.js";
import { listScriptAnalyses } from "../../modules/script/repo.js";
import { analyzeScriptForUser } from "../../modules/script/service.js";
import { requireMcpUser } from "../context.js";

export function registerScriptTools(server: McpServer) {
  server.registerTool(
    "sunbee_fetch_video_transcript",
    {
      title: "Fetch Video Transcript",
      description:
        "Fetch the transcript/captions of a video URL as plain text, for use as a script source. Works on YouTube and many other sites via yt-dlp, but only if the source already has captions/subtitles — sites without native captions (e.g. TikTok, Instagram, Facebook Reels) will fail. Requires yt-dlp available on the Sunbee machine.",
      inputSchema: {
        url: z.string().min(1).describe("Video URL (YouTube or any site yt-dlp supports)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      const scriptText = await fetchTranscriptFromVideoUrl(url);
      return { content: [{ type: "text", text: scriptText }] };
    },
  );

  server.registerTool(
    "sunbee_estimate_script_cost",
    {
      title: "Estimate Script Analysis Cost",
      description:
        "Estimate the OpenAI cost of calling sunbee_analyze_script on a given script, before spending anything. Returns estimated input/output tokens, estimated cost in USD, and a confidence label.",
      inputSchema: {
        script_text: z.string().min(1).describe("The script text to estimate cost for"),
        provider: z
          .enum(["openai", "claude"])
          .default("openai")
          .describe("Which provider's pricing to estimate against"),
        model: z
          .string()
          .optional()
          .describe(
            "Specific model id to estimate against (defaults to that provider's default model)",
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ script_text, provider, model }) => {
      const estimate = estimateAnalyzeScriptCost(script_text, 0, provider, model);
      return {
        content: [{ type: "text", text: JSON.stringify(estimate, null, 2) }],
        structuredContent: estimate,
      };
    },
  );

  server.registerTool(
    "sunbee_analyze_script",
    {
      title: "Analyze Script",
      description:
        "Analyze a video script with AI: breaks it into scenes (content, visual direction, duration, narrative role, shot framing, hero moment, required assets), lists resources needed (shots, voiceover, music, images), and summarizes the overall style (genre, tags, tone). Persists the result to the caller's script history. Requires an OpenAI API key configured in Sunbee Settings. Call sunbee_estimate_script_cost first to preview cost.",
      inputSchema: {
        script_text: z.string().min(1).describe("The full script text to analyze"),
        source_type: z
          .enum(["youtube", "import"])
          .default("import")
          .describe("Where the script came from"),
        source_url: z
          .string()
          .optional()
          .describe("Source URL, when source_type is 'youtube'"),
        style_template_id: z
          .string()
          .optional()
          .describe(
            "Id of a saved style template (from sunbee_list_style_templates) to keep the analysis consistent with",
          ),
        provider: z
          .enum(["openai", "claude"])
          .default("openai")
          .describe("Which AI provider to analyze with"),
        model: z
          .string()
          .optional()
          .describe(
            "Specific model id to analyze with (defaults to that provider's default model)",
          ),
        effort: z
          .enum(["low", "medium", "high"])
          .default("medium")
          .describe("Reasoning effort to use, for models that support it"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (
      { script_text, source_type, source_url, style_template_id, provider, model, effort },
      ctx,
    ) => {
      const user = requireMcpUser(ctx);
      let response;
      try {
        response = await analyzeScriptForUser(user, {
          scriptText: script_text,
          sourceType: source_type,
          sourceUrl: source_url,
          styleTemplateId: style_template_id,
          provider,
          model,
          effort,
        });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        };
      }
      const { versionId: _versionId, ...result } = response;
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "sunbee_list_script_history",
    {
      title: "List Script History",
      description:
        "List previously analyzed scripts (scenes, resources) for the caller's Sunbee account, most recent first.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20).describe("Maximum records to return"),
        offset: z.number().int().min(0).default(0).describe("Number of records to skip"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit, offset }, ctx) => {
      const user = requireMcpUser(ctx);
      const all = listScriptAnalyses(user.id, user.role === "admin");
      const page = all.slice(offset, offset + limit);
      const hasMore = all.length > offset + page.length;
      const summary = {
        total: all.length,
        count: page.length,
        offset,
        records: page,
        has_more: hasMore,
        ...(hasMore ? { next_offset: offset + page.length } : {}),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    },
  );
}
