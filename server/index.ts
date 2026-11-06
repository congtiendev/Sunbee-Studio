import "./load-env.js";
import { createApp } from "./app.js";
import { PORT } from "./env.js";
import { logger } from "./services/logger.js";

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info("server started", { port: PORT });
});

process.on("SIGTERM", () => {
  logger.info("server stopping", { signal: "SIGTERM" });
  server.close();
});
process.on("SIGINT", () => {
  logger.info("server stopping", { signal: "SIGINT" });
  server.close();
});
