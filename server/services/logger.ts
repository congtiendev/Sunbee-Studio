import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../env.js";

type LogLevel = "info" | "warn" | "error";

let logDirReady = false;

function logDir(): string {
  const dir = join(dataDir(), "logs");
  if (!logDirReady) {
    mkdirSync(dir, { recursive: true });
    logDirReady = true;
  }
  return dir;
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(logDir(), `server-${date}.log`);
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  });

  const console_ = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  console_(`[sunbee-server] ${line}`);

  try {
    appendFileSync(logFilePath(), line + "\n", "utf-8");
  } catch {
    // if the log file can't be written, logging must never crash the server
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
