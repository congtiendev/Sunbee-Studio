import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod-mcp";
import { listTemplates, saveTemplate } from "../../services/db/style-templates-repo.js";
import { requireMcpUser } from "../context.js";

export function registerTemplateTools(server: McpServer) {
  server.registerTool(
    "sunbee_list_style_templates",
    {
      title: "List Style Templates",
      description:
        "List the reusable video style templates (genre, style tags, pacing, tone, resource inventory) saved for the caller's Sunbee account.",
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (ctx) => {
      const user = requireMcpUser(ctx);
      const templates = listTemplates(user.id, user.role === "admin");
      return {
        content: [{ type: "text", text: JSON.stringify(templates, null, 2) }],
        structuredContent: { templates },
      };
    },
  );

  server.registerTool(
    "sunbee_save_style_template",
    {
      title: "Save Style Template",
      description:
        "Save a reusable video style template (genre, style tags, pacing, tone, resource inventory) to the caller's Sunbee account, for reuse on future videos.",
      inputSchema: {
        name: z.string().min(1).describe("Template name"),
        genre: z.string().min(1).describe("Genre, e.g. 'product review'"),
        style_tags: z.array(z.string()).describe("Style keywords/tags"),
        tone_description: z.string().min(1).describe("Tone/voice description"),
        avg_shot_length_sec: z.number().describe("Average shot length in seconds"),
        cuts_per_minute: z.number().describe("Average cuts per minute"),
        resource_inventory: z
          .record(z.string(), z.unknown())
          .describe("Resources this style typically needs (free-form key/value)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (
      {
        name,
        genre,
        style_tags,
        tone_description,
        avg_shot_length_sec,
        cuts_per_minute,
        resource_inventory,
      },
      ctx,
    ) => {
      const user = requireMcpUser(ctx);
      const template = saveTemplate(user.id, {
        name,
        type: "script",
        genre,
        styleTags: style_tags,
        toneDescription: tone_description,
        pacing: {
          avgShotLengthSec: avg_shot_length_sec,
          cutsPerMinute: cuts_per_minute,
        },
        resourceInventory: resource_inventory,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(template, null, 2) }],
        structuredContent: template,
      };
    },
  );
}
