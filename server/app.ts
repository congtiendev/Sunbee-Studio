import cookieParser from "cookie-parser";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { staticDir } from "./env.js";
import { errorLogger, requestLogger } from "./middleware/request-logger.js";
import { adminRouter } from "./routes/auth.js";
import authRouter from "./routes/auth.js";
import categoriesRouter from "./routes/categories.js";
import { featureModules, stepModules } from "./modules/index.js";
import dataRouter from "./routes/data.js";
import documentsRouter from "./routes/documents.js";
import filesRouter from "./routes/files.js";
import mcpRouter from "./routes/mcp.js";
import projectsRouter from "./routes/projects.js";
import promptsRouter from "./routes/prompts.js";
import settingsRouter from "./routes/settings.js";
import templatesRouter from "./routes/templates.js";
import videosRouter from "./routes/videos.js";

export function createApp() {
  const app = express();

  // Script analyze requests carry up to ~600 base64 video frames (~60MB worst
  // case at MAX_FRAMES_SAFETY_CAP) — leave real headroom above that.
  // Backups carry every script version's frames (a real one was ~300MB). Parsed
  // here first, so the general parser below skips this route.
  app.use("/api/data/import", express.json({ limit: "500mb" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/videos", videosRouter);
  app.use("/api/data", dataRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/prompts", promptsRouter);
  // Each step and feature module mounts its own API (e.g. /api/script, /api/training).
  for (const module of [...stepModules, ...featureModules]) {
    if (module.router && module.mountPath) app.use(`/api/${module.mountPath}`, module.router);
  }
  app.use("/mcp", mcpRouter);

  const dist = staticDir();
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(join(dist, "index.html"));
    });
  }

  app.use(errorLogger);

  return app;
}
