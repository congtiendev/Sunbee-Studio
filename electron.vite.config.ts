import { externalizeDepsPlugin, defineConfig } from "electron-vite";
import path from "path";
import viteConfig from "./vite.config";

export default defineConfig((env) => {
  // vite.config.ts exports a config *function* (it reads env for the dev proxy), so
  // it has to be called — spreading the function itself copies nothing and leaves
  // the renderer without the React, SVGR and Tailwind plugins.
  const rendererConfig =
    typeof viteConfig === "function" ? viteConfig(env) : viteConfig;

  return {
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
  };
});
