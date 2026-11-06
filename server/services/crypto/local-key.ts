import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../../env.js";

let cachedKey: Buffer | null = null;

function keyFilePath(): string {
  return join(dataDir(), "local.key");
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const path = keyFilePath();
  if (existsSync(path)) {
    cachedKey = readFileSync(path);
    return cachedKey;
  }
  const key = randomBytes(32);
  writeFileSync(path, key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

export function encryptLocal(value: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptLocal(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf-8");
}
