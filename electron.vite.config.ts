import { externalizeDepsPlugin, defineConfig } from "electron-vite";
import path from "path";
import rendererConfig from "./vite.config";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron/main",
      lib: { entry: "electron/main/index.ts" },
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    ...rendererConfig,
    root: ".",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: path.resolve(import.meta.dirname, "./index.html"),
      },
    },
  },
});
