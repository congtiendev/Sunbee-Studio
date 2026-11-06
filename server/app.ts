import cookieParser from "cookie-parser";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { staticDir } from "./env.js";
import { errorLogger, requestLogger } from "./middleware/request-logger.js";
import { adminRouter } from "./routes/auth.js";
import authRouter from "./routes/auth.js";
import categoriesRouter from "./routes/categories.js";
import dataRouter from "./routes/data.js";
import mcpRouter from "./routes/mcp.js";
import projectsRouter from "./routes/projects.js";
import scriptRouter from "./routes/script.js";
import settingsRouter from "./routes/settings.js";
import templatesRouter from "./routes/templates.js";
import videosRouter from "./routes/videos.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));
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
  app.use("/api/script", scriptRouter);
  app.use("/api/data", dataRouter);
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
