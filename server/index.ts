import "./load-env.js";
import { createApp } from "./app.js";
import { PORT } from "./env.js";
import { logger } from "./services/logger.js";

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info("server started", { port: PORT });
});
// Some AI jobs run for minutes (e.g. training a skill on several long scripts);
// Node's default 5-minute request timeout would cut them off.
server.requestTimeout = 30 * 60_000;

process.on("SIGTERM", () => {
  logger.info("server stopping", { signal: "SIGTERM" });
  server.close();
});
process.on("SIGINT", () => {
  logger.info("server stopping", { signal: "SIGINT" });
  server.close();
});
