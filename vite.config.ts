import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Follow the backend's SUNBEE_PORT (shell env or .env) so the /api proxy never drifts from it.
  const apiPort = loadEnv(mode, process.cwd(), "SUNBEE_").SUNBEE_PORT || "4317";

  return {
    plugins: [
      react(),
      svgr(),
      tailwindcss(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        "@shared": path.resolve(import.meta.dirname, "./shared"),
      },
    },
    server: {
      proxy: {
        // Voice preview/separate-vocals can cold-start a local model for
        // minutes on first use — the proxy's own default timeout would cut
        // that off as a bogus 502 well before the backend actually fails.
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          timeout: 30 * 60_000,
          proxyTimeout: 30 * 60_000,
        },
      },
    },
  };
});
