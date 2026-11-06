import { builtinModules } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-server",
    emptyOutDir: true,
    ssr: true,
    target: "node18",
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "server/index.ts"),
      output: { format: "esm", entryFileNames: "index.js" },
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "express",
        "cookie-parser",
        "better-sqlite3",
        "openai",
        "@anthropic-ai/sdk",
        "multer",
        "zod-mcp",
        "@modelcontextprotocol/server",
        "@modelcontextprotocol/express",
        "@modelcontextprotocol/node",
      ],
    },
  },
});
