import "./load-env.js";
import { createApp } from "./app.js";
import { PORT } from "./env.js";
import { logger } from "./services/logger.js";
import { getVoiceEngineBaseUrl, stopVoiceEngine } from "./services/voice/engine-process.js";

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info("server started", { port: PORT });
});

// Pre-warm the voice sidecar (venv + model load) at boot instead of on the
// user's first "nghe thử" click — the first-ever call is otherwise minutes
// slow (pip install, model download). Swallow errors: a real request still
// surfaces a clear one if Python/the venv genuinely isn't set up.
void getVoiceEngineBaseUrl().catch((err) => {
  logger.warn("voice engine pre-warm failed", { error: err instanceof Error ? err.message : String(err) });
});
// Some AI jobs run for minutes (e.g. training a skill on several long scripts);
// Node's default 5-minute request timeout would cut them off.
server.requestTimeout = 30 * 60_000;

process.on("SIGTERM", () => {
  logger.info("server stopping", { signal: "SIGTERM" });
  stopVoiceEngine();
  server.close();
});
process.on("SIGINT", () => {
  logger.info("server stopping", { signal: "SIGINT" });
  stopVoiceEngine();
  server.close();
});
