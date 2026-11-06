import { McpServer } from "@modelcontextprotocol/server";
import { registerScriptTools } from "./tools/script.js";
import { registerTemplateTools } from "./tools/templates.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "sunbee-editor", version: "1.0.0" });
  registerScriptTools(server);
  registerTemplateTools(server);
  return server;
}
