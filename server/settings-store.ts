import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./env.js";
import { decryptLocal, encryptLocal } from "./services/crypto/local-key.js";
import type { AppSettings, UiPreferences } from "../shared/types.js";

interface RawAnthropicKey {
  id: string;
  name: string;
  apiKey: string; // encrypted
}

interface RawUserSettings extends UiPreferences {
  openaiApiKey?: string; // encrypted
  mcpToken?: string; // encrypted
  mcpEnabled?: string;
  anthropicApiKeys?: RawAnthropicKey[];
  activeAnthropicApiKeyId?: string;
  /** Legacy single-key field, migrated into `anthropicApiKeys` on first read/write. */
  anthropicApiKey?: string;
  /** Keys of research sources (pexels, pixabay, ...), by source key. Values encrypted. */
  researchApiKeys?: Record<string, string>;
}

const UI_PREFERENCE_KEYS = [
  "themeMode",
  "uiStyle",
  "glassOpacity",
  "glassRadius",
  "scaleMode",
] as const satisfies readonly (keyof UiPreferences)[];

function filePath() {
  return join(dataDir(), "settings.json");
}

function readAllRaw(): Record<string, RawUserSettings> {
  const path = filePath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeAllRaw(all: Record<string, RawUserSettings>): void {
  writeFileSync(filePath(), JSON.stringify(all, null, 2), "utf-8");
}

function migrateLegacyAnthropicKey(raw: RawUserSettings): void {
  if (raw.anthropicApiKey && !raw.anthropicApiKeys) {
    const id = randomUUID();
    raw.anthropicApiKeys = [{ id, name: "Default", apiKey: raw.anthropicApiKey }];
    raw.activeAnthropicApiKeyId = id;
  }
  delete raw.anthropicApiKey;
}

export function getSettings(userId: string): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  const result: AppSettings = { encryptionAvailable: true };
  if (raw.openaiApiKey) result.openaiApiKey = decryptLocal(raw.openaiApiKey);
  if (raw.mcpToken) result.mcpToken = decryptLocal(raw.mcpToken);
  if (raw.mcpEnabled !== undefined) result.mcpEnabled = raw.mcpEnabled === "true";

  for (const key of UI_PREFERENCE_KEYS) {
    if (raw[key] !== undefined) (result[key] as unknown) = raw[key];
  }

  if (raw.researchApiKeys && Object.keys(raw.researchApiKeys).length > 0) {
    result.researchApiKeys = Object.fromEntries(
      Object.entries(raw.researchApiKeys).map(([source, value]) => [source, decryptLocal(value)]),
    );
  }

  const anthropicKeys = raw.anthropicApiKeys ?? [];
  if (anthropicKeys.length > 0) {
    result.anthropicApiKeys = anthropicKeys.map((k) => ({
      id: k.id,
      name: k.name,
      apiKey: decryptLocal(k.apiKey),
    }));
    const active =
      anthropicKeys.find((k) => k.id === raw.activeAnthropicApiKeyId) ?? anthropicKeys[0]!;
    result.activeAnthropicApiKeyId = active.id;
    result.anthropicApiKey = decryptLocal(active.apiKey);
  }

  return result;
}

export function setSettings(userId: string, patch: Partial<AppSettings>): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  if (patch.openaiApiKey !== undefined) raw.openaiApiKey = encryptLocal(patch.openaiApiKey);
  if (patch.mcpToken !== undefined) raw.mcpToken = encryptLocal(patch.mcpToken);
  if (patch.mcpEnabled !== undefined) raw.mcpEnabled = String(patch.mcpEnabled);

  for (const key of UI_PREFERENCE_KEYS) {
    if (patch[key] !== undefined) (raw[key] as unknown) = patch[key];
  }

  // Merge per source: an empty string removes that source's key.
  if (patch.researchApiKeys) {
    const keys = { ...raw.researchApiKeys };
    for (const [source, value] of Object.entries(patch.researchApiKeys)) {
      if (value.trim()) keys[source] = encryptLocal(value.trim());
      else delete keys[source];
    }
    raw.researchApiKeys = keys;
  }

  all[userId] = raw;
  writeAllRaw(all);
  return getSettings(userId);
}

export function addAnthropicKey(userId: string, name: string, apiKey: string): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  const id = randomUUID();
  raw.anthropicApiKeys = [...(raw.anthropicApiKeys ?? []), { id, name, apiKey: encryptLocal(apiKey) }];
  raw.activeAnthropicApiKeyId ??= id;

  all[userId] = raw;
  writeAllRaw(all);
  return getSettings(userId);
}

export function removeAnthropicKey(userId: string, id: string): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  raw.anthropicApiKeys = (raw.anthropicApiKeys ?? []).filter((k) => k.id !== id);
  if (raw.activeAnthropicApiKeyId === id) {
    raw.activeAnthropicApiKeyId = raw.anthropicApiKeys[0]?.id;
  }

  all[userId] = raw;
  writeAllRaw(all);
  return getSettings(userId);
}

export function renameAnthropicKey(userId: string, id: string, name: string): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  const key = (raw.anthropicApiKeys ?? []).find((k) => k.id === id);
  if (!key) throw new Error("Không tìm thấy API key này.");
  key.name = name;

  all[userId] = raw;
  writeAllRaw(all);
  return getSettings(userId);
}

export function setActiveAnthropicKey(userId: string, id: string): AppSettings {
  const all = readAllRaw();
  const raw = all[userId] ?? {};
  migrateLegacyAnthropicKey(raw);

  if (!(raw.anthropicApiKeys ?? []).some((k) => k.id === id)) {
    throw new Error("Không tìm thấy API key này.");
  }
  raw.activeAnthropicApiKeyId = id;

  all[userId] = raw;
  writeAllRaw(all);
  return getSettings(userId);
}
