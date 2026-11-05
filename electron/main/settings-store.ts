import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings } from "../shared/types.js";

const ENCRYPTED_KEYS = ["openaiApiKey", "anthropicApiKey"] as const;

function filePath() {
  return join(app.getPath("userData"), "settings.json");
}

function readRaw(): Record<string, string> {
  const path = filePath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function getSettings(): AppSettings {
  const raw = readRaw();
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const result: AppSettings = { encryptionAvailable };
  for (const key of ENCRYPTED_KEYS) {
    const encoded = raw[key];
    if (!encoded) continue;
    result[key] = encryptionAvailable
      ? safeStorage.decryptString(Buffer.from(encoded, "base64"))
      : Buffer.from(encoded, "base64").toString("utf-8");
  }
  return result;
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const raw = readRaw();
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  for (const key of ENCRYPTED_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    raw[key] = encryptionAvailable
      ? safeStorage.encryptString(value).toString("base64")
      : Buffer.from(value, "utf-8").toString("base64");
  }
  writeFileSync(filePath(), JSON.stringify(raw, null, 2), "utf-8");
  return getSettings();
}
